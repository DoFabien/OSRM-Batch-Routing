import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { ApiResponse } from '@/types';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  }

  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};