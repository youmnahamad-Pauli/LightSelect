import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../lib/jwt';
import { AppError } from '../lib/errors';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    next(new AppError(401, 'Authentication required'));
    return;
  }
  try {
    req.user = verifyToken(auth.slice(7));
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}
