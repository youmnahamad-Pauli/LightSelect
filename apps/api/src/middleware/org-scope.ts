import type { Request } from 'express';
import { AppError } from '../lib/errors';

/**
 * Returns the organization id from the authenticated request.
 * Call this in any route that queries org-scoped data.
 */
export function getOrgId(req: Request): string {
  if (!req.user?.organizationId) {
    throw new AppError(403, 'Organization context missing');
  }
  return req.user.organizationId;
}
