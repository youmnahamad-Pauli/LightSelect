import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../lib/errors';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code ?? null },
    });
    return;
  }

  if (err instanceof ZodError) {
    const fields = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
    res.status(400).json({
      success: false,
      error: { message: 'Validation failed', code: 'VALIDATION_ERROR', fields },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 50 MB.'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field.'
          : `Upload error: ${err.message}`;
    res.status(400).json({ success: false, error: { message, code: err.code } });
    return;
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  });
}
