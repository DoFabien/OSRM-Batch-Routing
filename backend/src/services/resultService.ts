import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { logger } from '@/utils/logger';
import type { RouteResult, BatchResult, RouteConfiguration, BatchJob } from '@/types';
import type { LineString } from 'geojson';

export class ResultService {
  private readonly resultsDir = process.env['RESULTS_DIR'] || './results';
  private readonly maxResultsKept = parseInt(process.env['MAX_RESULTS_KEPT'] || '100');
  private readonly cleanupInterval = parseInt(process.env['FILE_CLEANUP_INTERVAL'] || '24') * 60 * 60 * 1000;
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor() {
    this.ensureResultsDir();
    this.startCleanupScheduler();
  }

  private async ensureResultsDir(): Promise<void> {
    try {
      await fs.access(this.resultsDir);
    } catch {
      await fs.mkdir(this.resultsDir, { recursive: true });
      logger.info(`Created results directory: ${this.resultsDir}`);
    }
  }

  /**
   * Save GeoJSON results to disk using streaming
   */
  async saveGeoJSONResults(jobId: string, results: RouteResult[], summary: any, configuration?: RouteConfiguration, job?: BatchJob): Promise<string> {
    const filename = `routing_results_${jobId}.geojson`;
    const filePath = path.join(this.resultsDir, filename);
    
    // Also save metadata separately
    await this.saveMetadata(jobId, summary, configuration, job);

    try {
      // Create write stream for efficient large file handling
      const writeStream = createWriteStream(filePath, { encoding: 'utf8' });

      // Start GeoJSON structure
      writeStream.write('{\n');
      writeStream.write('  "type": "FeatureCollection",\n');
      writeStream.write('  "features": [\n');

      // Stream features one by one to avoid memory issues
      let featureCount = 0;
      let hasFeatures = false;

      logger.info(`Writing ${results.length} results to GeoJSON for job ${jobId}`);

      for (const result of results) {
        if (result.success && result.route) {
          // Add comma separator for previous features
          if (hasFeatures) {
            writeStream.write(',\n');
          }

          // Determine geometry based on configuration
          let geometry = result.route.geometry;
          
          const geometryOptions = configuration?.geometryOptions;
          
          if (geometryOptions?.straightLineGeometry) {
            // Create straight line geometry from start to end point
            geometry = this.createStraightLineGeometry(result.route.geometry);
          } else if (geometryOptions?.simplifyGeometry && geometryOptions.simplificationTolerance) {
            // Simplify the geometry using tolerance
            geometry = this.simplifyGeometry(result.route.geometry, geometryOptions.simplificationTolerance);
          }

          const feature = {
            type: 'Feature',
            geometry: geometryOptions?.exportGeometry !== false ? geometry : null,
            properties: {
              ...result.originalData,
              distance: result.route.distance,
              duration: result.route.duration,
              distance_km: Math.round(result.route.distance / 10) / 100,
              duration_minutes: Math.round(result.route.duration / 60 * 100) / 100,
              rowIndex: result.rowIndex
            }
          };

          // Write feature as pretty-printed JSON with proper indentation
          const featureJson = JSON.stringify(feature, null, 4);
          // Indent each line by 4 spaces to maintain GeoJSON structure
          const indentedFeature = featureJson.split('\n').map(line => '    ' + line).join('\n');
          writeStream.write(indentedFeature);

          featureCount++;
          hasFeatures = true;
        } else if (!result.success) {
          logger.debug(`Skipping failed result for rowIndex ${result.rowIndex}: ${result.error}`);
        } else if (!result.route) {
          logger.warn(`Skipping result for rowIndex ${result.rowIndex}: no route data`);
        }
      }
      
      logger.info(`Written ${featureCount} features out of ${results.length} results`);

      // Close features array - NO metadata in GeoJSON
      writeStream.write('\n  ]\n');
      writeStream.write('}\n');

      // Close the stream and wait for completion
      await new Promise<void>((resolve, reject) => {
        writeStream.end((error: any) => {
          if (error) reject(error);
          else resolve();
        });
      });

      // Get file stats for logging
      const stats = await fs.stat(filePath);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

      logger.info(`GeoJSON saved successfully: ${filename}`, {
        jobId,
        features: featureCount,
        fileSizeMB: `${fileSizeMB}MB`,
        path: filePath
      });

      return filePath;
    } catch (error) {
      logger.error(`Failed to save GeoJSON for job ${jobId}:`, error);
      // Try to cleanup partial file
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup partial file ${filePath}:`, cleanupError);
      }
      throw error;
    }
  }

  /**
   * Save metadata to a separate JSON file
   */
  async saveMetadata(jobId: string, summary: any, configuration?: RouteConfiguration, job?: BatchJob): Promise<void> {
    const filename = `routing_metadata_${jobId}.json`;
    const filePath = path.join(this.resultsDir, filename);

    try {
      // Calculate job execution duration
      let jobDuration = 0;
      let jobDurationSeconds = 0;
      if (job?.startedAt) {
        const endTime = job.completedAt || new Date();
        jobDuration = endTime.getTime() - job.startedAt.getTime();
        jobDurationSeconds = Math.round(jobDuration / 1000);
      }

      const metadata = {
        jobId,
        summary,
        generatedAt: new Date().toISOString(),
        configuration: {
          projection: configuration?.projection,
          originFields: configuration?.originFields,
          destinationFields: configuration?.destinationFields,
          geometryOptions: configuration?.geometryOptions
        },
        jobTiming: job?.startedAt ? {
          startedAt: job.startedAt.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          durationMs: jobDuration,
          durationSeconds: jobDurationSeconds
        } : undefined,
        files: {
          geojson: `routing_results_${jobId}.geojson`,
          metadata: filename
        }
      };

      // Write metadata as pretty-printed JSON
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf8');
      
      logger.info(`Metadata saved successfully: ${filename}`);
    } catch (error) {
      logger.error(`Failed to save metadata for job ${jobId}:`, error);
      // Non-fatal error - continue even if metadata save fails
    }
  }

  /**
   * Create straight line geometry from start to end point
   */
  private createStraightLineGeometry(originalGeometry: LineString): LineString {
    if (!originalGeometry.coordinates || originalGeometry.coordinates.length < 2) {
      return originalGeometry;
    }
    
    const startPoint = originalGeometry.coordinates[0];
    const endPoint = originalGeometry.coordinates[originalGeometry.coordinates.length - 1];
    
    return {
      type: 'LineString',
      coordinates: [startPoint, endPoint]
    };
  }

  /**
   * Simplify geometry using Douglas-Peucker algorithm
   */
  private simplifyGeometry(originalGeometry: LineString, tolerance: number): LineString {
    if (!originalGeometry.coordinates || originalGeometry.coordinates.length < 3) {
      return originalGeometry;
    }
    
    const simplified = this.douglasPeucker(originalGeometry.coordinates, tolerance);
    
    return {
      type: 'LineString',
      coordinates: simplified
    };
  }

  /**
   * Douglas-Peucker line simplification algorithm
   */
  private douglasPeucker(points: number[][], tolerance: number): number[][] {
    if (points.length <= 2) {
      return points;
    }

    let maxDistance = 0;
    let maxIndex = 0;
    const startPoint = points[0];
    const endPoint = points[points.length - 1];

    // Find the point with maximum distance from the line between start and end
    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.pointToLineDistance(points[i], startPoint, endPoint);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const leftPoints = this.douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const rightPoints = this.douglasPeucker(points.slice(maxIndex), tolerance);
      
      // Combine results (remove duplicate point at junction)
      return leftPoints.slice(0, -1).concat(rightPoints);
    } else {
      // Return just start and end points
      return [startPoint, endPoint];
    }
  }

  /**
   * Calculate perpendicular distance from point to line
   */
  private pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
    const [px, py] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;

    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      // Line start and end are the same point
      return Math.sqrt(A * A + B * B);
    }

    const param = dot / lenSq;
    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if GeoJSON file exists for a job
   */
  async hasGeoJSONFile(jobId: string): Promise<boolean> {
    const filename = `routing_results_${jobId}.geojson`;
    const filePath = path.join(this.resultsDir, filename);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get GeoJSON file path for a job
   */
  getGeoJSONFilePath(jobId: string): string {
    const filename = `routing_results_${jobId}.geojson`;
    return path.join(this.resultsDir, filename);
  }

  /**
   * Get metadata file path for a job
   */
  getMetadataFilePath(jobId: string): string {
    const filename = `routing_metadata_${jobId}.json`;
    return path.join(this.resultsDir, filename);
  }

  /**
   * Check if metadata file exists for a job
   */
  async hasMetadataFile(jobId: string): Promise<boolean> {
    const filePath = this.getMetadataFilePath(jobId);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get GeoJSON file stats
   */
  async getGeoJSONFileStats(jobId: string): Promise<{ size: number; created: Date } | null> {
    try {
      const filePath = this.getGeoJSONFilePath(jobId);
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete GeoJSON file
   */
  async deleteGeoJSONFile(jobId: string): Promise<void> {
    try {
      // Delete GeoJSON file
      const filePath = this.getGeoJSONFilePath(jobId);
      await fs.unlink(filePath);
      logger.info(`GeoJSON file deleted: ${jobId}`);
      
      // Also delete metadata file
      const metadataPath = path.join(this.resultsDir, `routing_metadata_${jobId}.json`);
      try {
        await fs.unlink(metadataPath);
        logger.info(`Metadata file deleted: ${jobId}`);
      } catch (error) {
        // Metadata file might not exist - that's ok
        logger.debug(`Metadata file not found for job ${jobId}`);
      }
    } catch (error) {
      logger.error(`Failed to delete GeoJSON file for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old GeoJSON files
   */
  async cleanupOldResults(): Promise<void> {
    try {
      const files = await fs.readdir(this.resultsDir);
      const geojsonFiles = files.filter(f => f.endsWith('.geojson') && f.startsWith('routing_results_'));

      if (geojsonFiles.length <= this.maxResultsKept) {
        return;
      }

      // Get file stats and sort by creation time
      const fileStats = await Promise.all(
        geojsonFiles.map(async (filename) => {
          const filePath = path.join(this.resultsDir, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            filePath,
            created: stats.birthtime
          };
        })
      );

      // Sort by creation time (newest first)
      fileStats.sort((a, b) => b.created.getTime() - a.created.getTime());

      // Delete old files
      const toDelete = fileStats.slice(this.maxResultsKept);
      let deletedCount = 0;
      let deletedSize = 0;

      for (const file of toDelete) {
        try {
          const stats = await fs.stat(file.filePath);
          await fs.unlink(file.filePath);
          deletedCount++;
          deletedSize += stats.size;
          
          // Also try to delete associated metadata file
          const jobId = file.filename.replace('routing_results_', '').replace('.geojson', '');
          const metadataPath = path.join(this.resultsDir, `routing_metadata_${jobId}.json`);
          try {
            const metaStats = await fs.stat(metadataPath);
            await fs.unlink(metadataPath);
            deletedSize += metaStats.size;
          } catch {
            // Metadata file might not exist
          }
        } catch (error) {
          logger.error(`Failed to delete old result file ${file.filename}:`, error);
        }
      }

      if (deletedCount > 0) {
        const deletedSizeMB = (deletedSize / 1024 / 1024).toFixed(2);
        logger.info(`Cleaned up ${deletedCount} old GeoJSON files (${deletedSizeMB}MB freed, keeping ${this.maxResultsKept} most recent)`);
      }
    } catch (error) {
      logger.error('Failed to cleanup old result files:', error);
    }
  }

  /**
   * Start automatic cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldResults().catch(error => {
        logger.error('Scheduled result cleanup failed:', error);
      });
    }, this.cleanupInterval);

    logger.info(`Result cleanup scheduler started (interval: ${this.cleanupInterval / 1000 / 60 / 60}h, max files: ${this.maxResultsKept})`);
  }

  /**
   * Stop cleanup scheduler
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined as NodeJS.Timeout | undefined;
      logger.info('Result cleanup scheduler stopped');
    }
  }

  /**
   * Get results directory info
   */
  async getResultsInfo(): Promise<{ totalFiles: number; totalSizeMB: number }> {
    try {
      const files = await fs.readdir(this.resultsDir);
      const geojsonFiles = files.filter(f => f.endsWith('.geojson'));
      
      let totalSize = 0;
      for (const filename of geojsonFiles) {
        try {
          const filePath = path.join(this.resultsDir, filename);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        } catch {
          // Skip files that can't be accessed
        }
      }

      return {
        totalFiles: geojsonFiles.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
      };
    } catch {
      return { totalFiles: 0, totalSizeMB: 0 };
    }
  }
}

export const resultService = new ResultService();