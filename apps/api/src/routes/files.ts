import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, desc, gt } from 'drizzle-orm';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import { db } from '../db/client';
import { files } from '../db/schema/files';
import { project_files } from '../db/schema/project-files';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { getStorageAdapter, LocalStorageAdapter } from '../lib/storage';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { config } from '../config';

// ─── Allowed file types ────────────────────────────────────────────────────

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// ─── Multer setup ──────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          400,
          `File type "${file.mimetype}" is not supported. Upload PDF, Word, Excel, CSV, or image files.`,
          'UNSUPPORTED_FILE_TYPE',
        ),
      );
    }
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function formatMimeLabel(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'Image';
  if (mime.includes('spreadsheetml')) return 'Excel';
  if (mime === 'text/csv') return 'CSV';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'Word';
  return 'Document';
}

function toFileResponse(file: typeof files.$inferSelect, downloadUrl?: string) {
  const adapter = getStorageAdapter();
  const publicUrl = adapter.getPublicUrl(file.storage_path) ?? downloadUrl;
  return {
    id: file.id,
    organization_id: file.organization_id,
    uploaded_by: file.uploaded_by,
    original_file_name: file.original_file_name,
    stored_file_name: file.stored_file_name,
    mime_type: file.mime_type,
    mime_label: file.mime_type ? formatMimeLabel(file.mime_type) : 'Document',
    file_size_bytes: file.file_size_bytes,
    checksum: file.checksum,
    upload_status: file.upload_status,
    download_url: publicUrl ?? null,
    created_at: file.created_at,
    updated_at: file.updated_at,
  };
}

// ─── Router ────────────────────────────────────────────────────────────────

export const filesRouter = Router();
filesRouter.use(authenticate);

// POST /files — multipart upload
filesRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'No file provided.');
      const orgId = getOrgId(req);
      const adapter = getStorageAdapter();

      // Create a placeholder record first so we have the file ID for the storage path
      const [placeholder] = await db
        .insert(files)
        .values({
          organization_id: orgId,
          uploaded_by: req.user!.userId,
          original_file_name: req.file.originalname,
          stored_file_name: req.file.originalname,
          storage_path: 'pending',
          mime_type: req.file.mimetype,
          file_size_bytes: req.file.size,
          upload_status: 'pending',
        })
        .returning();

      try {
        const { storagePath, storedFileName } = await adapter.store({
          orgId,
          fileId: placeholder.id,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          buffer: req.file.buffer,
        });

        const checksum = sha256(req.file.buffer);

        const [updated] = await db
          .update(files)
          .set({
            storage_path: storagePath,
            stored_file_name: storedFileName,
            checksum,
            upload_status: 'uploaded',
            updated_at: new Date(),
          })
          .where(eq(files.id, placeholder.id))
          .returning();

        const downloadUrl = `${config.frontendUrl.replace(':3000', ':3001')}/files/${updated.id}/download`;
        return success(res, toFileResponse(updated, downloadUrl), 201);
      } catch (storageErr) {
        // Mark the record as failed so it can be retried
        await db
          .update(files)
          .set({ upload_status: 'failed', updated_at: new Date() })
          .where(eq(files.id, placeholder.id));
        throw storageErr;
      }
    } catch (err) {
      return next(err);
    }
  },
);

// GET /files — list org's uploaded files
filesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(files)
      .where(eq(files.organization_id, orgId))
      .orderBy(desc(files.created_at));

    const apiBase = `${req.protocol}://${req.get('host')}`;
    return success(
      res,
      rows.map((f) => toFileResponse(f, `${apiBase}/files/${f.id}/download`)),
    );
  } catch (err) {
    return next(err);
  }
});

// GET /files/:fileId — file metadata
filesRouter.get('/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, req.params.fileId), eq(files.organization_id, orgId)))
      .limit(1);
    if (!file) throw new AppError(404, 'File not found');
    const apiBase = `${req.protocol}://${req.get('host')}`;
    return success(res, toFileResponse(file, `${apiBase}/files/${file.id}/download`));
  } catch (err) {
    return next(err);
  }
});

// GET /files/:fileId/download — stream binary (local adapter only)
filesRouter.get('/:fileId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, req.params.fileId), eq(files.organization_id, orgId)))
      .limit(1);
    if (!file) throw new AppError(404, 'File not found');
    if (file.upload_status !== 'uploaded') throw new AppError(409, 'File not yet available for download');

    const adapter = getStorageAdapter();
    const publicUrl = adapter.getPublicUrl(file.storage_path);

    if (publicUrl) {
      return res.redirect(302, publicUrl);
    }

    if (!(adapter instanceof LocalStorageAdapter)) {
      throw new AppError(500, 'Adapter does not support streaming.');
    }

    const absPath = adapter.resolvePath(file.storage_path);
    if (!absPath || !fs.existsSync(absPath)) {
      throw new AppError(404, 'File binary not found on disk.');
    }

    res.setHeader('Content-Type', file.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.original_file_name}"`);
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    return next(err);
  }
});

// DELETE /files/:fileId — delete unmapped file
filesRouter.delete('/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, req.params.fileId), eq(files.organization_id, orgId)))
      .limit(1);
    if (!file) throw new AppError(404, 'File not found');

    // Block deletion if the file is mapped to any active project file
    const [mappingCount] = await db
      .select({ n: count() })
      .from(project_files)
      .where(and(eq(project_files.file_id, req.params.fileId), eq(project_files.is_active, true)));
    if ((mappingCount?.n ?? 0) > 0) {
      throw new AppError(
        409,
        'This file is assigned to one or more projects. Remove it from all projects before deleting.',
        'FILE_MAPPED',
      );
    }

    try {
      await getStorageAdapter().delete(file.storage_path);
    } catch {
      // Storage deletion failure should not prevent DB cleanup
    }

    await db.delete(files).where(eq(files.id, req.params.fileId));
    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});
