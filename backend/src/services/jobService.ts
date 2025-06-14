import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import { fileService } from './fileService';
import { projectionService } from './projectionService';
import { osrmService } from './osrmService';
import { resultService } from './resultService';
import type { BatchJob, RouteConfiguration, RouteResult, BatchResult, WebSocketMessage } from '@/types';

export class JobService {
  private jobs: Map<string, BatchJob> = new Map();
  private jobResults: Map<string, RouteResult[]> = new Map();
  private readonly maxJobsKept = parseInt(process.env['MAX_JOBS_KEPT'] || '100');
  private readonly cleanupInterval = parseInt(process.env['FILE_CLEANUP_INTERVAL'] || '24') * 60 * 60 * 1000; // hours
  private readonly immediateCleanup = process.env['IMMEDIATE_CLEANUP'] === 'true';
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor() {
    this.startCleanupScheduler();
  }

  /**
   * Create a new batch routing job
   */
  async createJob(configuration: RouteConfiguration): Promise<string> {
    const jobId = uuidv4();
    
    // Validate file exists
    const file = fileService.getFileById(configuration.fileId);
    if (!file) {
      throw new Error('File not found');
    }

    // Validate projection
    const projection = projectionService.getProjectionByCode(configuration.projection.code);
    if (!projection) {
      throw new Error('Invalid projection');
    }

    // Create job
    const job: BatchJob = {
      id: jobId,
      fileId: configuration.fileId,
      configuration,
      status: 'pending',
      progress: {
        total: file.rowCount,
        processed: 0,
        successful: 0,
        failed: 0
      },
      startedAt: new Date()
    };

    this.jobs.set(jobId, job);
    
    logger.info(`Created batch job ${jobId} for file ${configuration.fileId}`, {
      projection: configuration.projection?.code,
      originFields: configuration.originFields,
      destinationFields: configuration.destinationFields,
      geometryOptions: configuration.geometryOptions,
      totalRows: file.rowCount
    });
    
    // Start processing asynchronously
    this.processJob(jobId).catch(error => {
      logger.error(`Job ${jobId} failed:`, error);
      this.updateJobStatus(jobId, 'failed', error.message);
    });

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): BatchJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get job results
   */
  getJobResults(jobId: string): RouteResult[] | undefined {
    return this.jobResults.get(jobId);
  }

  /**
   * Process batch routing job
   */
  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    try {
      // Update status
      this.updateJobStatus(jobId, 'processing');

      // Read file data
      const fileData = await fileService.parseFileData(job.fileId);
      if (!fileData) {
        throw new Error('Failed to read file data');
      }

      const results: RouteResult[] = [];
      const batchSize = parseInt(process.env['BATCH_SIZE'] || '100'); // Optimized batch size for performance

      // Process data in batches
      for (let i = 0; i < fileData.length; i += batchSize) {
        const batch = fileData.slice(i, i + batchSize);
        
        // Extract and validate coordinates for this batch
        const batchCoordinates = batch.map((row, batchIndex) => {
          const rowIndex = i + batchIndex;
          
          try {
            // Extract origin coordinates
            const originXField = job.configuration.originFields.x;
            const originYField = job.configuration.originFields.y;
            const destXField = job.configuration.destinationFields.x;
            const destYField = job.configuration.destinationFields.y;
            
            const originX = parseFloat(row[originXField]);
            const originY = parseFloat(row[originYField]);
            
            // Extract destination coordinates
            const destX = parseFloat(row[destXField]);
            const destY = parseFloat(row[destYField]);

            if (isNaN(originX) || isNaN(originY) || isNaN(destX) || isNaN(destY)) {
              throw new Error('Invalid coordinate values');
            }

            return {
              rowIndex,
              originalData: row,
              originX,
              originY,
              destX,
              destY
            };
          } catch (error) {
            // Add failed result immediately
            results.push({
              rowIndex,
              originalData: row,
              success: false,
              error: `Coordinate extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
            return null;
          }
        }).filter(coord => coord !== null);

        if (batchCoordinates.length === 0) {
          // Update progress for skipped batch
          this.updateJobProgress(jobId, batch.length, 0);
          continue;
        }

        // Transform coordinates to WGS84
        const transformedOrigins = projectionService.transformBatch(
          batchCoordinates.map(c => ({ x: c!.originX, y: c!.originY, rowIndex: c!.rowIndex, originalData: c!.originalData })),
          job.configuration.projection
        );

        const transformedDestinations = projectionService.transformBatch(
          batchCoordinates.map(c => ({ x: c!.destX, y: c!.destY, rowIndex: c!.rowIndex, originalData: c!.originalData })),
          job.configuration.projection
        );

        // Prepare routing requests
        const routingRequests = batchCoordinates.map(coord => {
          const origin = transformedOrigins.find(o => o.rowIndex === coord!.rowIndex);
          const destination = transformedDestinations.find(d => d.rowIndex === coord!.rowIndex);

          if (!origin?.success || !destination?.success) {
            results.push({
              rowIndex: coord!.rowIndex,
              originalData: coord!.originalData,
              success: false,
              error: 'Coordinate transformation failed'
            });
            return null;
          }

          return {
            rowIndex: coord!.rowIndex,
            originalData: coord!.originalData,
            originLng: origin.longitude,
            originLat: origin.latitude,
            destLng: destination.longitude,
            destLat: destination.latitude
          };
        }).filter(req => req !== null);

        if (routingRequests.length > 0) {
          // Calculate routes
          const routeResults = await osrmService.calculateBatchRoutes(routingRequests);
          results.push(...routeResults);
          
          // Update progress
          const successful = routeResults.filter(r => r.success).length;
          this.updateJobProgress(jobId, batch.length, successful);
        } else {
          // All requests in this batch failed
          this.updateJobProgress(jobId, batch.length, 0);
        }

        // Send progress update via WebSocket
        this.sendProgressUpdate(jobId);
      }

      // Store results in memory and save to disk
      this.jobResults.set(jobId, results);
      
      logger.info(`Storing ${results.length} results for job ${jobId}`);
      
      // Calculate summary for GeoJSON
      const successful = results.filter(r => r.success);
      const totalDistance = successful.reduce((sum, r) => sum + (r.route?.distance || 0), 0);
      const totalDuration = successful.reduce((sum, r) => sum + (r.route?.duration || 0), 0);
      
      const summary = {
        total: results.length,
        successful: successful.length,
        failed: results.length - successful.length,
        totalDistance,
        totalDuration
      };
      
      logger.info(`Job ${jobId} summary:`, summary);

      // Calculate job duration before completion
      const jobDuration = job.startedAt ? Date.now() - job.startedAt.getTime() : 0;
      const jobDurationSeconds = Math.round(jobDuration / 1000);
      
      // Save GeoJSON to disk using streaming
      try {
        await resultService.saveGeoJSONResults(jobId, results, summary, job.configuration, job);
        logger.info(`GeoJSON saved to disk for job ${jobId}`);
      } catch (error) {
        logger.error(`Failed to save GeoJSON for job ${jobId}:`, error);
        // Continue with job completion even if file save fails
      }

      this.updateJobStatus(jobId, 'completed');
      
      logger.info(`Job ${jobId} completed successfully`, {
        total: results.length,
        successful: successful.length,
        failed: results.length - successful.length,
        duration: `${jobDurationSeconds}s`
      });

      // Immediate cleanup if enabled
      if (this.immediateCleanup) {
        this.cleanupCompletedJob(jobId);
      }

    } catch (error) {
      logger.error(`Job ${jobId} processing failed:`, error);
      this.updateJobStatus(jobId, 'failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Update job status
   */
  private updateJobStatus(jobId: string, status: BatchJob['status'], error?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    if (error) {
      job.error = error;
    }
    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date();
    }

    this.jobs.set(jobId, job);
    this.sendStatusUpdate(jobId, status);
  }

  /**
   * Update job progress
   */
  private updateJobProgress(jobId: string, processed: number, successful: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progress.processed += processed;
    job.progress.successful += successful;
    job.progress.failed += (processed - successful);

    this.jobs.set(jobId, job);
  }

  /**
   * Send progress update via WebSocket
   */
  private sendProgressUpdate(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const message: WebSocketMessage = {
      type: 'job_progress',
      jobId,
      data: {
        progress: job.progress,
        status: job.status
      }
    };

    this.broadcastWebSocketMessage(message);
  }

  /**
   * Send status update via WebSocket
   */
  private sendStatusUpdate(jobId: string, status: BatchJob['status']): void {
    const message: WebSocketMessage = {
      type: status === 'completed' ? 'job_completed' : status === 'failed' ? 'job_failed' : 'job_progress',
      jobId,
      data: { status }
    };

    this.broadcastWebSocketMessage(message);
  }

  /**
   * Broadcast WebSocket message to job subscribers
   */
  private broadcastWebSocketMessage(message: WebSocketMessage): void {
    try {
      if (message.jobId && global.broadcastJobUpdate) {
        global.broadcastJobUpdate(message.jobId, message.data);
      }
    } catch (error) {
      logger.error('Failed to broadcast WebSocket message:', error);
    }
  }

  /**
   * Cancel a running job and clean up all associated data
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      logger.warn(`Attempted to cancel non-existent job: ${jobId}`);
      return false;
    }
    
    if (job.status === 'completed' || job.status === 'failed') {
      logger.warn(`Attempted to cancel already finished job: ${jobId} (status: ${job.status})`);
      return false;
    }
    
    logger.info(`Cancelling job ${jobId}`);
    
    // Update job status
    this.updateJobStatus(jobId, 'failed', 'Job cancelled by user');
    
    // Clean up associated data
    this.jobResults.delete(jobId);
    
    // Clean up any GeoJSON file
    try {
      const hasFile = await resultService.hasGeoJSONFile(jobId);
      if (hasFile) {
        await resultService.deleteGeoJSONFile(jobId);
        logger.info(`Deleted GeoJSON file for cancelled job ${jobId}`);
      }
    } catch (error) {
      logger.error(`Failed to delete GeoJSON file for job ${jobId}:`, error);
    }
    
    // Send cancellation update via WebSocket
    this.sendStatusUpdate(jobId, 'failed');
    
    logger.info(`Job ${jobId} cancelled and cleaned up successfully`);
    return true;
  }

  /**
   * Generate export data
   */
  generateExport(jobId: string): BatchResult | null {
    const job = this.jobs.get(jobId);
    const results = this.jobResults.get(jobId);
    
    if (!job || !results || job.status !== 'completed') {
      return null;
    }

    const successful = results.filter(r => r.success);
    const totalDistance = successful.reduce((sum, r) => sum + (r.route?.distance || 0), 0);
    const totalDuration = successful.reduce((sum, r) => sum + (r.route?.duration || 0), 0);
    
    // Calculate job execution duration
    const jobDuration = job.startedAt && job.completedAt 
      ? job.completedAt.getTime() - job.startedAt.getTime() 
      : 0;
    const jobDurationSeconds = Math.round(jobDuration / 1000);

    return {
      jobId,
      status: 'completed',
      results,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: results.length - successful.length,
        totalDistance,
        totalDuration,
        jobDurationMs: jobDuration,
        jobDurationSeconds
      }
    };
  }

  /**
   * Clean up old jobs based on configuration
   */
  cleanupOldJobs(): void {
    const jobEntries = Array.from(this.jobs.entries())
      .sort(([, a], [, b]) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));

    if (jobEntries.length > this.maxJobsKept) {
      const toDelete = jobEntries.slice(this.maxJobsKept);
      toDelete.forEach(([jobId]) => {
        this.jobs.delete(jobId);
        this.jobResults.delete(jobId);
      });
      
      logger.info(`Cleaned up ${toDelete.length} old jobs (keeping ${this.maxJobsKept} most recent)`);
    }
  }

  /**
   * Start automatic cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldJobs();
    }, this.cleanupInterval);

    logger.info(`Job cleanup scheduler started (interval: ${this.cleanupInterval / 1000 / 60 / 60}h)`);
  }

  /**
   * Stop cleanup scheduler
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined as NodeJS.Timeout | undefined;
      logger.info('Job cleanup scheduler stopped');
    }
  }

  /**
   * Clean up a specific job and all associated data (public method)
   */
  async cleanupJob(jobId: string): Promise<boolean> {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        logger.warn(`Attempted to cleanup non-existent job: ${jobId}`);
        return false;
      }

      logger.info(`Cleaning up job ${jobId}`);

      // Clean up associated file
      if (job.fileId) {
        try {
          await fileService.deleteFile(job.fileId);
          logger.info(`Deleted file ${job.fileId} for job ${jobId}`);
        } catch (error) {
          logger.warn(`Failed to cleanup file ${job.fileId} for job ${jobId}:`, error);
        }
      }

      // Clean up any GeoJSON file
      try {
        const hasFile = await resultService.hasGeoJSONFile(jobId);
        if (hasFile) {
          await resultService.deleteGeoJSONFile(jobId);
          logger.info(`Deleted GeoJSON file for job ${jobId}`);
        }
      } catch (error) {
        logger.error(`Failed to delete GeoJSON file for job ${jobId}:`, error);
      }

      // Remove job and results from memory
      this.jobs.delete(jobId);
      this.jobResults.delete(jobId);

      logger.info(`Job ${jobId} cleaned up successfully`);
      return true;

    } catch (error) {
      logger.error(`Failed to cleanup job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Clean up a specific completed job immediately
   */
  private cleanupCompletedJob(jobId: string): void {
    try {
      const job = this.jobs.get(jobId);
      if (!job) return;

      // Clean up associated file
      if (job.fileId) {
        fileService.deleteFile(job.fileId).catch(error => {
          logger.warn(`Failed to cleanup file ${job.fileId} for job ${jobId}:`, error);
        });
      }

      // Remove job and results from memory after a short delay to allow export
      setTimeout(() => {
        this.jobs.delete(jobId);
        this.jobResults.delete(jobId);
        logger.info(`Immediate cleanup completed for job ${jobId}`);
      }, 30000); // 30 second delay to allow download

    } catch (error) {
      logger.error(`Failed to cleanup job ${jobId}:`, error);
    }
  }
}

export const jobService = new JobService();