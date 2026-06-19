import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { document_types } from '../db/schema/categories';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

export const documentTypesRouter = Router();
documentTypesRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().min(1).max(20).toUpperCase().optional().nullable(),
  description: z.string().max(500).nullable().optional(),
});

// GET /document-types
documentTypesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db
      .select()
      .from(document_types)
      .where(eq(document_types.is_active, true))
      .orderBy(asc(document_types.name));
    return success(res, rows);
  } catch (err) {
    return next(err);
  }
});

// POST /document-types
documentTypesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.parse(req.body);

    if (body.code) {
      const [existing] = await db
        .select({ id: document_types.id })
        .from(document_types)
        .where(eq(document_types.code, body.code))
        .limit(1);
      if (existing) throw new AppError(409, `Document type with code "${body.code}" already exists.`);
    }

    const [created] = await db.insert(document_types).values(body).returning();
    return success(res, created, 201);
  } catch (err) {
    return next(err);
  }
});
