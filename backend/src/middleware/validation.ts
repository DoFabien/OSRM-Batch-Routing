import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ValidationError } from '@/utils/errors';
import { ApiResponse } from '@/types';

export const validateRequest = (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
    }));

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: validationErrors,
    });
    return;
  }
  
  next();
};