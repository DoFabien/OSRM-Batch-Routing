import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { jobService } from '@/services/jobService';
import { osrmService } from '@/services/osrmService';
import { projectionService } from '@/services/projectionService';
import { resultService } from '@/services/resultService';
import { exportService } from '@/services/exportService';
import { logger } from '@/utils/logger';
import type { ApiResponse, RouteConfiguration, BatchJob, BatchResult } from '@/types';

const router = Router();

/**
 * GET /api/routing/test
 * Test endpoint to verify routing module is working
 */
router.get('/test', (req: Request, res: Response) => {
  logger.info('Test endpoint hit - routing module is working');
  res.json({ 
    success: true, 
    message: 'Routing module is working',
    timestamp: new Date().toISOString()
  });
});

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
 * GET /api/routing/export/:jobId/:format
 * Download results in specified format (geojson, geopackage)
 */
router.get('/export/:jobId/:format',
  [
    param('jobId').isUUID().withMessage('Invalid job ID'),
    param('format').isIn(['geojson', 'geopackage']).withMessage('Format must be geojson or geopackage')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error(`Validation errors for export request:`, errors.array());
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        errors: errors.array()
      });
    }

    const { jobId, format } = req.params;
    logger.info(`Export request: jobId=${jobId}, format=${format}`);
    
    // Check if job exists and is completed
    const job = jobService.getJob(jobId);
    if (!job) {
      logger.error(`Job not found: ${jobId}`);
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    logger.info(`Job found: ${jobId}, status=${job.status}`);

    if (job.status !== 'completed') {
      logger.error(`Job not completed: ${jobId}, current status: ${job.status}`);
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet'
      });
    }

    // Get results
    logger.info(`Getting results for job: ${jobId}`);
    const results = jobService.generateExport(jobId);
    if (!results) {
      logger.error(`No results available for job: ${jobId}`);
      return res.status(500).json({
        success: false,
        error: 'Results not available'
      });
    }

    logger.info(`Results found for job ${jobId}: ${results.summary.successful} successful routes`);

    if (format === 'geojson') {
      // For GeoJSON, try to use existing file first, then fallback to generation
      const hasFile = await resultService.hasGeoJSONFile(jobId);
      if (hasFile) {
        const filePath = resultService.getGeoJSONFilePath(jobId);
        const filename = `routing_results_${jobId.substring(0, 8)}.geojson`;
        
        res.setHeader('Content-Type', 'application/geo+json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        return res.sendFile(filePath);
      }
      
      // Generate GeoJSON in memory (fallback)
      const tempDir = process.env.TEMP_DIR || '/app/temp';
      // Ensure temp directory exists
      const fs = require('fs');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const outputPath = `${tempDir}/export_${jobId}.geojson`;
      
      await exportService.exportBatchResults(results, {
        format: 'geojson',
        outputPath
      });
      
      const filename = `routing_results_${jobId.substring(0, 8)}.geojson`;
      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      return res.sendFile(outputPath, (error) => {
        if (error) {
          logger.error(`Failed to send GeoJSON file:`, error);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Failed to download file' });
          }
        }
        // Cleanup temp file
        setTimeout(() => {
          require('fs').unlink(outputPath, () => {});
        }, 5000);
      });
    }

    if (format === 'geopackage') {
      logger.info(`Starting GeoPackage export for job: ${jobId}`);
      
      const tempDir = process.env.TEMP_DIR || '/app/temp';
      logger.info(`Using temp directory: ${tempDir}`);
      
      // Ensure temp directory exists
      const fs = require('fs');
      if (!fs.existsSync(tempDir)) {
        logger.info(`Creating temp directory: ${tempDir}`);
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const outputPath = `${tempDir}/export_${jobId}.gpkg`;
      logger.info(`GeoPackage output path: ${outputPath}`);
      
      try {
        // Calculate bounds for metadata
        logger.info(`Calculating bounds from ${results.results.length} results`);
        const bounds = {
          minLat: 90, maxLat: -90,
          minLon: 180, maxLon: -180
        };
        
        let routesWithGeometry = 0;
        results.results.forEach(result => {
          if (result.success && result.route?.geometry) {
            routesWithGeometry++;
            result.route.geometry.coordinates.forEach(([lon, lat]) => {
              bounds.minLat = Math.min(bounds.minLat, lat);
              bounds.maxLat = Math.max(bounds.maxLat, lat);
              bounds.minLon = Math.min(bounds.minLon, lon);
              bounds.maxLon = Math.max(bounds.maxLon, lon);
            });
          }
        });
        
        logger.info(`Bounds calculation complete: ${routesWithGeometry} routes with geometry, bounds:`, bounds);
        
        logger.info(`Calling exportService.exportBatchResults...`);
        await exportService.exportBatchResults(results, {
          format: 'geopackage',
          outputPath
        }, {
          tableName: 'routes',
          description: `Route calculations for job ${jobId}`,
          bounds,
          totalFeatures: results.summary.successful
        });
        
        logger.info(`GeoPackage export completed: ${outputPath}`);
        
        // Check if file was created
        if (!fs.existsSync(outputPath)) {
          logger.error(`GeoPackage file was not created: ${outputPath}`);
          return res.status(500).json({
            success: false,
            error: 'GeoPackage file was not created'
          });
        }
        
        const stats = fs.statSync(outputPath);
        logger.info(`GeoPackage file size: ${stats.size} bytes`);
        
        const filename = `routing_results_${jobId.substring(0, 8)}.gpkg`;
        res.setHeader('Content-Type', 'application/geopackage+sqlite3');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        logger.info(`Sending GeoPackage file: ${outputPath}`);
        return res.sendFile(outputPath, (error) => {
          if (error) {
            logger.error(`Failed to send GeoPackage file:`, error);
            if (!res.headersSent) {
              res.status(500).json({ success: false, error: 'Failed to download file' });
            }
          } else {
            logger.info(`GeoPackage file sent successfully: ${filename}`);
          }
          // Cleanup temp file
          setTimeout(() => {
            require('fs').unlink(outputPath, (unlinkError: any) => {
              if (unlinkError) {
                logger.warn(`Failed to cleanup temp file ${outputPath}:`, unlinkError);
              } else {
                logger.info(`Cleaned up temp file: ${outputPath}`);
              }
            });
          }, 5000);
        });
        
      } catch (error) {
        logger.error(`Failed to generate GeoPackage for job ${jobId}:`, error);
        logger.error(`Error stack:`, (error as Error).stack);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate GeoPackage file',
          details: (error as Error).message
        });
      }
    }

  })
);

/**
 * GET /api/routing/metadata/:jobId
 * Get job metadata as JSON
 */
router.get('/metadata/:jobId',
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
    
    try {
      const metadataPath = resultService.getMetadataFilePath(jobId);
      const metadataExists = await resultService.hasMetadataFile(jobId);
      
      if (!metadataExists) {
        return res.status(404).json({
          success: false,
          error: 'Metadata not found'
        });
      }
      
      // Send metadata file
      res.sendFile(metadataPath);
    } catch (error) {
      logger.error(`Failed to get metadata for job ${jobId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metadata'
      });
    }
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

/**
 * DELETE /api/routing/job/:jobId
 * Cancel a running job and clean up all associated data
 */
router.delete('/job/:jobId',
  [param('jobId').isUUID().withMessage('Invalid job ID')],
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID format'
      });
    }

    const { jobId } = req.params;
    
    try {
      const cancelled = await jobService.cancelJob(jobId);
      
      if (cancelled) {
        logger.info(`Job ${jobId} cancelled successfully`);
        res.json({
          success: true
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Job not found or already completed'
        });
      }
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel job'
      });
    }
  })
);

/**
 * DELETE /api/routing/job/:jobId/cleanup
 * Clean up completed job files and data from server
 */
router.delete('/job/:jobId/cleanup',
  [param('jobId').isUUID().withMessage('Invalid job ID')],
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID format'
      });
    }

    const { jobId } = req.params;
    
    try {
      const cleaned = await jobService.cleanupJob(jobId);
      
      if (cleaned) {
        logger.info(`Job ${jobId} cleaned up successfully`);
        res.json({
          success: true
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }
    } catch (error) {
      logger.error(`Failed to cleanup job ${jobId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup job'
      });
    }
  })
);

export default router;