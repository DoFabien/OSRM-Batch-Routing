import { Router, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, UploadedFile } from '@/types';
import { fileService } from '@/services/fileService';
import { ValidationError } from '@/utils/errors';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Route pour récupérer un échantillon des données
router.get('/:fileId/sample', 
  asyncHandler(async (req: Request, res: Response<ApiResponse<any>>) => {
    const { fileId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    try {
      const fileData = await fileService.getFileData(fileId);
      
      if (!fileData || fileData.length === 0) {
        res.status(404).json({
          success: false,
          error: 'File not found or empty',
        });
        return;
      }

      // Retourner un échantillon des données
      const sample = fileData.slice(0, limit);
      
      res.json({
        success: true,
        data: {
          headers: Object.keys(fileData[0] || {}),
          sample: sample,
          totalRows: fileData.length
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file sample',
      });
    }
  })
);

router.post('/', 
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response<ApiResponse<UploadedFile>>) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    // Validate file
    const validationErrors = fileService.validateFileUpload(req.file);
    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'File validation failed',
        errors: validationErrors,
      });
      return;
    }

    try {
      const uploadedFile = await fileService.processUploadedFile(req.file);
      
      res.json({
        success: true,
        data: uploadedFile,
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process uploaded file',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

router.get('/:fileId/preview', 
  asyncHandler(async (req: Request, res: Response<ApiResponse<Record<string, string>[]>>) => {
    const { fileId } = req.params;
    const limit = parseInt((req.query['limit'] as string) || '10') || 10;

    try {
      const data = await fileService.getFileData(fileId);
      const preview = data.slice(0, limit);
      
      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }
  })
);

router.delete('/:fileId',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { fileId } = req.params;

    try {
      await fileService.deleteFile(fileId);
      
      res.json({
        success: true,
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }
  })
);

export default router;