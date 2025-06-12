import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { projectionService } from '@/services/projectionService';
import { logger } from '@/utils/logger';
import type { ApiResponse, Projection } from '@/types';

const router = Router();

/**
 * GET /api/projections
 * Get all available coordinate system projections
 */
router.get('/', asyncHandler(async (req: Request, res: Response<ApiResponse<Projection[]>>) => {
  const { region, search } = req.query;
  
  let projections = projectionService.getProjections();
  
  if (search && typeof search === 'string') {
    projections = projectionService.searchProjections(search);
  } else if (region && typeof region === 'string') {
    projections = projectionService.getProjectionsByRegion(region);
  }
  
  logger.debug(`Retrieved ${projections.length} projections`);
  
  res.json({
    success: true,
    data: projections
  });
}));

/**
 * GET /api/projections/:code
 * Get specific projection by code
 */
router.get('/:code', asyncHandler(async (req: Request, res: Response<ApiResponse<Projection>>) => {
  const { code } = req.params;
  const projection = projectionService.getProjectionByCode(code);
  
  if (!projection) {
    res.status(404).json({
      success: false,
      error: `Projection ${code} not found`
    });
    return;
  }
  
  res.json({
    success: true,
    data: projection
  });
}));

export default router;