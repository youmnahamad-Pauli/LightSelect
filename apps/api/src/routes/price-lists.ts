import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import multer from 'multer';
import { db } from '../db/client';
import { price_lists, price_list_items } from '../db/schema/boq';
import { projects } from '../db/schema/projects';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, '_'));
  return lines.slice(1).map((line) => {
    // Handle quoted fields
    const values = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map((v) => v.replace(/^"|"$/g, '').trim()) ?? line.split(',').map((v) => v.trim());
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

const createPriceListSchema = z.object({
  name: z.string().min(1).max(200),
  vendor_name: z.string().max(200).nullable().optional(),
  currency: z.string().max(10).default('USD'),
});

async function assertProjectAccess(projectId: string, orgId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

async function assertPriceListAccess(priceListId: string, orgId: string) {
  const [pl] = await db
    .select({ id: price_lists.id, project_id: price_lists.project_id })
    .from(price_lists)
    .where(eq(price_lists.id, priceListId))
    .limit(1);
  if (!pl) throw new AppError(404, 'Price list not found');
  await assertProjectAccess(pl.project_id, orgId);
  return pl;
}

// ─── Nested router: /projects/:projectId/price-lists ──────────────────────

export const priceListProjectRouter = Router();
priceListProjectRouter.use(authenticate);

priceListProjectRouter.get('/:projectId/price-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const lists = await db
      .select()
      .from(price_lists)
      .where(eq(price_lists.project_id, req.params.projectId));
    return success(res, lists);
  } catch (err) {
    return next(err);
  }
});

priceListProjectRouter.post('/:projectId/price-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertProjectAccess(req.params.projectId, orgId);
    const body = createPriceListSchema.parse(req.body);
    const [pl] = await db
      .insert(price_lists)
      .values({ ...body, project_id: req.params.projectId, uploaded_by: req.user!.userId })
      .returning();
    return success(res, { ...pl, items: [] }, 201);
  } catch (err) {
    return next(err);
  }
});

// ─── Standalone router: /price-lists/:id ──────────────────────────────────

export const priceListRouter = Router();
priceListRouter.use(authenticate);

priceListRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertPriceListAccess(req.params.id, orgId);
    const [pl] = await db.select().from(price_lists).where(eq(price_lists.id, req.params.id)).limit(1);
    const items = await db
      .select()
      .from(price_list_items)
      .where(eq(price_list_items.price_list_id, req.params.id));
    return success(res, { ...pl, items });
  } catch (err) {
    return next(err);
  }
});

priceListRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    await assertPriceListAccess(req.params.id, orgId);
    await db.delete(price_lists).where(eq(price_lists.id, req.params.id));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /price-lists/:id/upload
 * Accepts a CSV file and parses it into price_list_items.
 * Expected columns: model_code, description (optional), unit_price, currency (optional)
 */
priceListRouter.post(
  '/:id/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      await assertPriceListAccess(req.params.id, orgId);

      if (!req.file) throw new AppError(400, 'No file provided.');
      if (!req.file.mimetype.includes('csv') && !req.file.mimetype.includes('text')) {
        throw new AppError(400, 'Only CSV files are supported.');
      }

      const text = req.file.buffer.toString('utf-8');
      const rows = parseCSV(text);

      if (rows.length === 0) {
        throw new AppError(400, 'CSV file is empty or could not be parsed. Expected columns: model_code, unit_price.');
      }

      // Validate required columns
      const firstRow = rows[0];
      if (!firstRow['model_code'] && !firstRow['model_number'] && !firstRow['code']) {
        throw new AppError(400, 'CSV must include a model_code (or model_number/code) column.');
      }

      // Delete existing items for this list
      await db.delete(price_list_items).where(eq(price_list_items.price_list_id, req.params.id));

      // Get list's currency as default
      const [pl] = await db
        .select({ currency: price_lists.currency })
        .from(price_lists)
        .where(eq(price_lists.id, req.params.id))
        .limit(1);

      const validRows: { price_list_id: string; model_code: string; description: string | undefined; unit_price: number; currency: string }[] = [];

      for (const row of rows) {
        const modelCode = (row['model_code'] || row['model_number'] || row['code'] || '').trim();
        const priceRaw = (row['unit_price'] || row['price'] || row['unitprice'] || '').replace(/[^0-9.]/g, '');
        const price = parseFloat(priceRaw);

        if (!modelCode || isNaN(price) || price < 0) continue;

        validRows.push({
          price_list_id: req.params.id,
          model_code: modelCode,
          description: row['description'] || undefined,
          unit_price: price,
          currency: row['currency'] || pl?.currency || 'USD',
        });
      }

      if (validRows.length === 0) {
        throw new AppError(400, 'No valid rows found. Check that model_code and unit_price columns have values.');
      }

      await db.insert(price_list_items).values(validRows);

      // Update price list timestamp
      await db.update(price_lists).set({ updated_at: new Date() }).where(eq(price_lists.id, req.params.id));

      const items = await db
        .select()
        .from(price_list_items)
        .where(eq(price_list_items.price_list_id, req.params.id));

      return success(res, { imported_count: validRows.length, items });
    } catch (err) {
      return next(err);
    }
  },
);
