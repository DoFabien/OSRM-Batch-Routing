import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { jobService } from '@/services/jobService';
import { osrmService } from '@/services/osrmService';
import { projectionService } from '@/services/projectionService';
import { resultService } from '@/services/resultService';
import { logger } from '@/utils/logger';
import type { ApiResponse, RouteConfiguration, BatchJob, BatchResult } from '@/types';

const router = Router();

/**
 * POST /api/routing/batch
 * Start a new batch routing job
 */
router.post('/batch',
  [
    body('fileId').notEmpty().withMessage('File ID is required'),
    body('projection.code').notEmpty().withMessage('Projection code is required'),
    body('originFields.x').notEmpty().withMessage('Origin X field is required'),
    body('originFields.y').notEmpty().withMessage('Origin Y field is required'),
    body('destinationFields.x').notEmpty().withMessage('Destination X field is required'),
    body('destinationFields.y').notEmpty().withMessage('Destination Y field is required'),
  ],
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ jobId: string }>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
          value: err.type === 'field' ? err.value : undefined
        }))
      });
    }

    const configuration: RouteConfiguration = req.body;

    // Validate projection exists
    const projection = projectionService.getProjectionByCode(configuration.projection.code);
    if (!projection) {
      return res.status(400).json({
        success: false,
        error: 'Invalid projection code'
      });
    }

    // Update configuration with full projection data
    configuration.projection = projection;

    try {
      const jobId = await jobService.createJob(configuration);
      
      logger.info(`Created batch routing job: ${jobId}`);
      
      res.json({
        success: true,
        data: { jobId }
      });
    } catch (error) {
      logger.error('Failed to create batch job:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create batch job'
      });
    }
  })
);

/**
 * GET /api/routing/status/:jobId
 * Get job status and progress
 */
router.get('/status/:jobId',
  [param('jobId').isUUID().withMessage('Invalid job ID')],
  asyncHandler(async (req: Request, res: Response<ApiResponse<BatchJob>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Invalid job ID format'
      });
      return;
    }

    const { jobId } = req.params;
    if (!jobId) {
      res.status(400).json({ success: false, error: 'Job ID required' });
      return;
    }
    const job = jobService.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      });
      return;
    }

    res.json({
      success: true,
      data: job
    });
  })
);

/**
 * GET /api/routing/results/:jobId
 * Get job results for export
 */
router.get('/results/:jobId',
  [param('jobId').isUUID().withMessage('Invalid job ID')],
  asyncHandler(async (req: Request, res: Response<ApiResponse<BatchResult>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID format'
      });
    }

    const { jobId } = req.params;
    const job = jobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet'
      });
    }

    const results = jobService.generateExport(jobId);
    if (!results) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate results'
      });
    }

    res.json({
      success: true,
      data: results
    });
  })
);

/**
 * GET /api/routing/export/:jobId
 * Download results as GeoJSON from disk
 */
router.get('/export/:jobId',
  [param('jobId').isUUID().withMessage('Invalid job ID')],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID format'
      });
    }

    const { jobId } = req.params;
    
    // Check if job exists and is completed
    const job = jobService.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet'
      });
    }

    // Check if GeoJSON file exists on disk
    const hasFile = await resultService.hasGeoJSONFile(jobId);
    if (!hasFile) {
      // Fallback to in-memory generation if file doesn't exist
      logger.warn(`GeoJSON file not found for job ${jobId}, falling back to memory generation`);
      
      const results = jobService.generateExport(jobId);
      if (!results) {
        return res.status(500).json({
          success: false,
          error: 'Results not available'
        });
      }

      // Generate GeoJSON in memory (fallback)
      const features = results.results
        .filter(result => result.success && result.route)
        .map(result => ({
          type: 'Feature' as const,
          geometry: result.route!.geometry,
          properties: {
            ...result.originalData,
            distance: result.route!.distance,
            duration: result.route!.duration,
            distance_km: Math.round(result.route!.distance / 10) / 100,
            duration_minutes: Math.round(result.route!.duration / 60 * 100) / 100,
            rowIndex: result.rowIndex
          }
        }));

      const geojson = {
        type: 'FeatureCollection' as const,
        features,
        metadata: {
          jobId,
          summary: results.summary,
          generatedAt: new Date().toISOString(),
          totalFeatures: features.length
        }
      };

      // Set headers for file download
      const filename = `routing_results_${jobId.substring(0, 8)}.geojson`;
      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      return res.json(geojson);
    }

    // Serve file directly from disk using streaming
    const filePath = resultService.getGeoJSONFilePath(jobId);
    const filename = `routing_results_${jobId.substring(0, 8)}.geojson`;
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/geo+json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Get file stats for Content-Length header
    try {
      const stats = await resultService.getGeoJSONFileStats(jobId);
      if (stats) {
        res.setHeader('Content-Length', stats.size);
      }
    } catch (error) {
      logger.warn(`Could not get file stats for ${jobId}:`, error);
    }

    // Stream file directly to response
    res.sendFile(filePath, (error) => {
      if (error) {
        logger.error(`Failed to stream GeoJSON file for job ${jobId}:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to download file'
          });
        }
      } else {
        logger.info(`GeoJSON file streamed successfully for job ${jobId}`);
      }
    });
  })
);

/**
 * GET /api/routing/health
 * Check OSRM service health
 */
router.get('/health',
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ osrm: boolean }>>) => {
    try {
      const osrmHealthy = await osrmService.healthCheck();
      
      res.json({
        success: true,
        data: { osrm: osrmHealthy }
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(500).json({
        success: false,
        error: 'Health check failed'
      });
    }
  })
);

/**
 * POST /api/routing/test
 * Test single route calculation
 */
router.post('/test',
  [
    body('origin.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid origin longitude'),
    body('origin.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid origin latitude'),
    body('destination.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid destination longitude'),
    body('destination.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid destination latitude'),
  ],
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
          value: err.type === 'field' ? err.value : undefined
        }))
      });
    }

    const { origin, destination } = req.body;

    try {
      const result = await osrmService.calculateRoute(
        origin.lng,
        origin.lat,
        destination.lng,
        destination.lat
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Test route calculation failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Route calculation failed'
      });
    }
  })
);

export default router;