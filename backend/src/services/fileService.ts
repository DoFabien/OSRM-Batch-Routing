import { promises as fs } from 'fs';
import path from 'path';
import csv from 'csvtojson';
import { v4 as uuidv4 } from 'uuid';
import { UploadedFile, ValidationError } from '@/types';
import { logger } from '@/utils/logger';

export class FileService {
  private readonly uploadDir = process.env['UPLOAD_DIR'] || './uploads';
  private readonly maxFilesKept = parseInt(process.env['MAX_FILES_KEPT'] || '50');
  private readonly maxFileSize = parseInt(process.env['MAX_FILE_SIZE'] || '52428800'); // 50MB
  private readonly cleanupInterval = parseInt(process.env['FILE_CLEANUP_INTERVAL'] || '24') * 60 * 60 * 1000; // hours to ms
  private files: Map<string, UploadedFile> = new Map();
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor() {
    this.ensureUploadDir();
    this.startCleanupScheduler();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async processUploadedFile(file: Express.Multer.File): Promise<UploadedFile> {
    const fileId = uuidv4();
    const filePath = path.join(this.uploadDir, `${fileId}_${file.originalname}`);
    
    try {
      // Save file to disk
      await fs.writeFile(filePath, file.buffer);
      
      // Detect separator and encoding
      const sample = file.buffer.toString('utf8', 0, 1000);
      const separator = this.detectSeparator(sample);
      
      // Parse CSV to get headers and row count
      const jsonArray = await csv({
        delimiter: separator,
        noheader: false,
      }).fromString(file.buffer.toString('utf8'));

      const headers = Object.keys(jsonArray[0] || {});
      const rowCount = jsonArray.length;

      const uploadedFile: UploadedFile = {
        id: fileId,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        headers,
        rowCount,
        encoding: 'utf8',
        separator,
      };

      // Store file metadata
      this.files.set(fileId, uploadedFile);

      logger.info(`File processed successfully: ${file.originalname}`, {
        fileId,
        rowCount,
        headers: headers.length,
      });

      return uploadedFile;
    } catch (error) {
      // Clean up file on error
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        logger.error('Failed to cleanup file on error:', unlinkError);
      }
      throw error;
    }
  }

  async getFileData(fileId: string): Promise<Record<string, string>[]> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const fileName = files.find(f => f.startsWith(fileId));
      
      if (!fileName) {
        throw new Error('File not found');
      }

      const filePath = path.join(this.uploadDir, fileName);
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      // Detect separator
      const separator = this.detectSeparator(fileContent.substring(0, 1000));
      
      // Parse CSV
      const jsonArray = await csv({
        delimiter: separator,
        noheader: false,
      }).fromString(fileContent);

      return jsonArray;
    } catch (error) {
      logger.error(`Failed to read file data for ${fileId}:`, error);
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const fileName = files.find(f => f.startsWith(fileId));
      
      if (fileName) {
        const filePath = path.join(this.uploadDir, fileName);
        await fs.unlink(filePath);
        logger.info(`File deleted: ${fileId}`);
      }
    } catch (error) {
      logger.error(`Failed to delete file ${fileId}:`, error);
      throw error;
    }
  }

  validateFileUpload(file: Express.Multer.File): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check file type by MIME type and extension
    const allowedMimeTypes = ['text/csv', 'text/plain', 'application/csv', 'application/octet-stream'];
    const allowedExtensions = ['.csv', '.tsv'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
    const isValidExtension = allowedExtensions.includes(fileExtension);
    
    if (!isValidMimeType && !isValidExtension) {
      errors.push({
        field: 'file',
        message: 'Invalid file type. Only CSV/TSV files are allowed.',
        value: file.mimetype,
      });
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push({
        field: 'file',
        message: `File size too large. Maximum size is ${Math.round(this.maxFileSize / 1024 / 1024)}MB.`,
        value: file.size,
      });
    }

    // Check if file is empty
    if (file.size === 0) {
      errors.push({
        field: 'file',
        message: 'File is empty.',
        value: file.size,
      });
    }

    return errors;
  }

  private detectSeparator(sample: string): string {
    const separators = [';', ',', '\t', '|'];
    let bestSeparator = ',';
    let maxColumns = 0;

    for (const sep of separators) {
      const lines = sample.split('\n').slice(0, 3); // Check first 3 lines
      const columnCounts = lines.map(line => line.split(sep).length);
      const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
      
      if (avgColumns > maxColumns) {
        maxColumns = avgColumns;
        bestSeparator = sep;
      }
    }

    return bestSeparator;
  }

  /**
   * Get file by ID
   */
  getFileById(fileId: string): UploadedFile | undefined {
    return this.files.get(fileId);
  }

  /**
   * Parse file data (alias for getFileData for job service)
   */
  async parseFileData(fileId: string): Promise<Record<string, string>[] | null> {
    try {
      return await this.getFileData(fileId);
    } catch (error) {
      logger.error(`Failed to parse file data for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Get all uploaded files metadata
   */
  getAllFiles(): UploadedFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Clean up old files based on configuration
   */
  async cleanupOldFiles(): Promise<void> {
    const files = Array.from(this.files.values())
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    if (files.length > this.maxFilesKept) {
      const toDelete = files.slice(this.maxFilesKept);
      
      for (const file of toDelete) {
        try {
          await this.deleteFile(file.id);
          this.files.delete(file.id);
        } catch (error) {
          logger.error(`Failed to cleanup old file ${file.id}:`, error);
        }
      }
      
      logger.info(`Cleaned up ${toDelete.length} old files (keeping ${this.maxFilesKept} most recent)`);
    }
  }

  /**
   * Start automatic cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldFiles().catch(error => {
        logger.error('Scheduled cleanup failed:', error);
      });
    }, this.cleanupInterval);

    logger.info(`File cleanup scheduler started (interval: ${this.cleanupInterval / 1000 / 60 / 60}h)`);
  }

  /**
   * Stop cleanup scheduler
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined as NodeJS.Timeout | undefined;
      logger.info('File cleanup scheduler stopped');
    }
  }
}

export const fileService = new FileService();