import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { ApiResponse, UploadedFile, CoordinateValidationResult } from '@/types';
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

// Route pour valider les coordonnées géographiques d'un fichier
router.post('/:fileId/validate-geography',
  [
    body('originFields.x').notEmpty().withMessage('Origin X field is required'),
    body('originFields.y').notEmpty().withMessage('Origin Y field is required'),
    body('destinationFields.x').notEmpty().withMessage('Destination X field is required'),
    body('destinationFields.y').notEmpty().withMessage('Destination Y field is required'),
    body('projection').isObject().withMessage('Projection is required'),
  ],
  asyncHandler(async (req: Request, res: Response<ApiResponse<CoordinateValidationResult>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
          value: err.type === 'field' ? (err as any).value : undefined
        }))
      });
      return;
    }

    const { fileId } = req.params;
    const configuration = req.body;

    try {
      // Vérifier que le fichier existe
      const fileMetadata = fileService.getFileById(fileId);
      if (!fileMetadata) {
        res.status(404).json({
          success: false,
          error: 'File not found',
        });
        return;
      }

      // Effectuer la validation géographique
      const validationResult = await fileService.validateGeographicBounds(fileId, configuration);
      
      res.json({
        success: true,
        data: validationResult,
      });
    } catch (error) {
      console.error('Geographic validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate geographic bounds',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// Route pour obtenir les informations sur le périmètre géographique supporté
router.get('/geographic-coverage',
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ description: string; bounds: any }>>) => {
    const { FRANCE_BOUNDS } = await import('@/services/geographicValidationService');
    
    res.json({
      success: true,
      data: {
        description: fileService.getSupportedGeographicArea(),
        bounds: FRANCE_BOUNDS
      },
    });
  })
);

export default router;