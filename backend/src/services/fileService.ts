import { promises as fs } from 'fs';
import path from 'path';
import csv from 'csvtojson';
import { v4 as uuidv4 } from 'uuid';
import chardet from 'chardet';
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
      
      // Detect encoding first
      const detectedEncoding = this.detectEncoding(file.buffer);
      
      // Detect separator and decimal separator using detected encoding
      const sample = file.buffer.toString(detectedEncoding as BufferEncoding, 0, 1000);
      const separator = this.detectSeparator(sample);
      const decimalSeparator = this.detectDecimalSeparator(sample);
      
      // Parse CSV to get headers and row count using detected encoding
      const fileContent = file.buffer.toString(detectedEncoding as BufferEncoding);
      const jsonArray = await csv({
        delimiter: separator,
        noheader: false,
      }).fromString(fileContent);

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
        encoding: detectedEncoding,
        separator,
        decimalSeparator,
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

      // Get file metadata to use stored encoding and separator
      const fileMetadata = this.files.get(fileId);
      const encoding = (fileMetadata?.encoding || 'utf8') as BufferEncoding;
      const separator = fileMetadata?.separator || ',';

      const filePath = path.join(this.uploadDir, fileName);
      const fileContent = await fs.readFile(filePath, encoding);
      
      // Parse CSV using stored separator and encoding
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
    const separators = [';', ',', '\t', '|', ':'];
    let bestSeparator = ',';
    let maxScore = 0;

    for (const sep of separators) {
      const score = this.calculateSeparatorScore(sample, sep);
      if (score > maxScore) {
        maxScore = score;
        bestSeparator = sep;
      }
    }

    return bestSeparator;
  }

  private calculateSeparatorScore(sample: string, separator: string): number {
    const lines = sample.split('\n').filter(line => line.trim().length > 0).slice(0, 10);
    if (lines.length < 2) return 0;

    // Count occurrences of separator in each line
    const columnCounts = lines.map(line => line.split(separator).length);
    
    // Check consistency across lines (same number of columns)
    const firstLineColumns = columnCounts[0];
    const consistency = columnCounts.filter(count => count === firstLineColumns).length / columnCounts.length;
    
    // More columns is generally better (minimum 2)
    const columnScore = Math.max(0, firstLineColumns - 1);
    
    // Penalize single column (probably wrong separator)
    if (firstLineColumns < 2) return 0;
    
    // Calculate final score: consistency is most important, then number of columns
    return consistency * 100 + columnScore * 2;
  }

  private detectDecimalSeparator(sample: string): '.' | ',' {
    // Count occurrences of potential decimal separators in numeric contexts
    const decimalDotPattern = /\d+\.\d+/g;
    const decimalCommaPattern = /\d+,\d+/g;
    
    const dotMatches = (sample.match(decimalDotPattern) || []).length;
    const commaMatches = (sample.match(decimalCommaPattern) || []).length;
    
    // Default to dot if no clear pattern
    if (dotMatches === 0 && commaMatches === 0) return '.';
    
    return dotMatches >= commaMatches ? '.' : ',';
  }

  private detectEncoding(buffer: Buffer): string {
    try {
      const detected = chardet.detect(buffer);
      if (detected) {
        // Normalize common encoding names
        if (Array.isArray(detected)) {
          return this.normalizeEncoding(detected[0].name);
        } else {
          return this.normalizeEncoding(detected);
        }
      }
    } catch (error) {
      logger.warn('Failed to detect encoding:', error);
    }
    
    // Default to utf8
    return 'utf8';
  }

  private normalizeEncoding(encoding: string): string {
    const normalized = encoding.toLowerCase();
    
    // Map common encoding variations to standard names
    const encodingMap: { [key: string]: string } = {
      'utf-8': 'utf8',
      'utf8': 'utf8',
      'iso-8859-1': 'latin1',
      'latin1': 'latin1',
      'windows-1252': 'latin1',
      'cp1252': 'latin1',
      'ascii': 'ascii'
    };
    
    return encodingMap[normalized] || 'utf8';
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