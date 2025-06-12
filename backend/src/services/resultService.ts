import { promises as fs } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { logger } from '@/utils/logger';
import type { RouteResult, BatchResult } from '@/types';

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
  async saveGeoJSONResults(jobId: string, results: RouteResult[], summary: any): Promise<string> {
    const filename = `routing_results_${jobId}.geojson`;
    const filePath = path.join(this.resultsDir, filename);

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

      for (const result of results) {
        if (result.success && result.route) {
          // Add comma separator for previous features
          if (hasFeatures) {
            writeStream.write(',\n');
          }

          const feature = {
            type: 'Feature',
            geometry: result.route.geometry,
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
        }
      }

      // Close features array and add metadata
      writeStream.write('\n  ],\n');
      writeStream.write('  "metadata": {\n');
      writeStream.write(`    "jobId": "${jobId}",\n`);
      writeStream.write('    "summary": ' + JSON.stringify(summary, null, 4).split('\n').map(line => '    ' + line).join('\n') + ',\n');
      writeStream.write(`    "generatedAt": "${new Date().toISOString()}",\n`);
      writeStream.write(`    "totalFeatures": ${featureCount}\n`);
      writeStream.write('  }\n');
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
      const filePath = this.getGeoJSONFilePath(jobId);
      await fs.unlink(filePath);
      logger.info(`GeoJSON file deleted: ${jobId}`);
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