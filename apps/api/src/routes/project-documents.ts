import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, asc, desc } from 'drizzle-orm';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/client';
import { project_documents, projectDocumentTypes } from '../db/schema/projects';
import { projects } from '../db/schema';
import { authenticate } from '../middleware/authenticate';
import { getOrgId } from '../middleware/org-scope';
import { AppError } from '../lib/errors';
import { success } from '../lib/response';
import { config } from '../config';
import { runSpecParser } from '../lib/spec-parser/pipeline';

// ─── Allowed MIME types (extends base set with DWG) ────────────────────────

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // DWG — stored as-is, never processed
  'image/vnd.dwg',
  'application/acad',
  'application/x-acad',
  'application/autocad_dwg',
  'image/x-dwg',
  'application/dwg',
  'application/x-dwg',
  'drawing/dwg',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(
        400,
        `File type "${file.mimetype}" is not supported.`,
        'UNSUPPORTED_FILE_TYPE',
      ));
    }
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isDwgMime(mime: string): boolean {
  return mime.includes('dwg') || mime.includes('acad') || mime.includes('autocad');
}

function inferDocumentType(mime: string, filename: string): typeof projectDocumentTypes[number] {
  const lower = filename.toLowerCase();
  if (isDwgMime(mime) || lower.endsWith('.dwg')) return 'drawing_dwg';
  if (mime === 'application/pdf' && lower.includes('spec')) return 'spec';
  if (mime === 'application/pdf' && (lower.includes('boq') || lower.includes('bill'))) return 'boq';
  return 'other';
}

function storageDirForProject(orgId: string, projectId: string): string {
  const base = path.join(process.cwd(), '..', 'project-documents', orgId, projectId);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

// ─── Validation schemas ─────────────────────────────────────────────────────

const classifySchema = z.object({
  document_type: z.enum(projectDocumentTypes),
});

// ─── Guards ─────────────────────────────────────────────────────────────────

async function assertProjectBelongsToOrg(projectId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organization_id, orgId)))
    .limit(1);
  if (!row) throw new AppError(404, 'Project not found');
}

// ─── Routers ────────────────────────────────────────────────────────────────

/** Nested under /projects/:projectId/documents */
export const projectDocumentsNestedRouter = Router({ mergeParams: true });
projectDocumentsNestedRouter.use(authenticate);

/** Flat /project-documents/:docId */
export const projectDocumentRouter = Router();
projectDocumentRouter.use(authenticate);

// POST /projects/:projectId/documents — upload a document
projectDocumentsNestedRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'No file provided.');
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };
      await assertProjectBelongsToOrg(projectId, orgId);

      const buffer = req.file.buffer;
      const originalFilename = req.file.originalname;
      const mime = req.file.mimetype;
      const docType = (req.body.document_type as typeof projectDocumentTypes[number] | undefined)
        ?? inferDocumentType(mime, originalFilename);

      // Store file on disk
      const dir = storageDirForProject(orgId, projectId);
      const fileId = crypto.randomUUID();
      const ext = path.extname(originalFilename);
      const storedName = `${fileId}${ext}`;
      const storedPath = path.join(dir, storedName);
      fs.writeFileSync(storedPath, buffer);

      const relativePath = path.join('project-documents', orgId, projectId, storedName);

      const [doc] = await db
        .insert(project_documents)
        .values({
          project_id: projectId,
          organization_id: orgId,
          uploaded_by: req.user!.userId,
          original_filename: originalFilename,
          stored_path: relativePath,
          mime_type: mime,
          file_size_bytes: req.file.size,
          document_type: docType,
          metadata: req.body.metadata ? JSON.parse(req.body.metadata) : null,
        })
        .returning();

      return success(res, doc, 201);
    } catch (err) {
      return next(err);
    }
  },
);

// GET /projects/:projectId/documents — list documents
projectDocumentsNestedRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };
      await assertProjectBelongsToOrg(projectId, orgId);

      const docs = await db
        .select()
        .from(project_documents)
        .where(
          and(
            eq(project_documents.project_id, projectId),
            eq(project_documents.organization_id, orgId),
          ),
        )
        .orderBy(desc(project_documents.uploaded_at));

      return success(res, docs);
    } catch (err) {
      return next(err);
    }
  },
);

// POST /projects/:projectId/parse-spec — parse a spec document into requirements
projectDocumentsNestedRouter.post(
  '/parse-spec',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { projectId } = req.params as { projectId: string };
      await assertProjectBelongsToOrg(projectId, orgId);

      const { document_id } = req.body as { document_id?: string };
      if (!document_id) throw new AppError(400, 'document_id is required');

      const [doc] = await db
        .select()
        .from(project_documents)
        .where(
          and(
            eq(project_documents.id, document_id),
            eq(project_documents.project_id, projectId),
          ),
        )
        .limit(1);

      if (!doc) throw new AppError(404, 'Document not found in this project');
      if (doc.mime_type !== 'application/pdf') {
        throw new AppError(400, 'Only PDF documents can be parsed as spec');
      }

      // Resolve absolute path
      const absPath = path.join(process.cwd(), '..', doc.stored_path);
      if (!fs.existsSync(absPath)) {
        throw new AppError(404, 'Document file not found on disk');
      }

      const result = await runSpecParser({
        filePath: absPath,
        orgId,
        projectId,
      });

      return success(res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// PATCH /project-documents/:docId — reclassify a document
projectDocumentRouter.patch(
  '/:docId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { docId } = req.params;
      const body = classifySchema.parse(req.body);

      const [doc] = await db
        .select()
        .from(project_documents)
        .where(
          and(
            eq(project_documents.id, docId),
            eq(project_documents.organization_id, orgId),
          ),
        )
        .limit(1);
      if (!doc) throw new AppError(404, 'Document not found');

      const [updated] = await db
        .update(project_documents)
        .set({ document_type: body.document_type, updated_at: new Date() })
        .where(eq(project_documents.id, docId))
        .returning();

      return success(res, updated);
    } catch (err) {
      return next(err);
    }
  },
);

// DELETE /project-documents/:docId — delete a document
projectDocumentRouter.delete(
  '/:docId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { docId } = req.params;

      const [doc] = await db
        .select()
        .from(project_documents)
        .where(
          and(
            eq(project_documents.id, docId),
            eq(project_documents.organization_id, orgId),
          ),
        )
        .limit(1);
      if (!doc) throw new AppError(404, 'Document not found');

      // Delete from disk
      try {
        const absPath = path.join(process.cwd(), '..', doc.stored_path);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      } catch {
        // Storage deletion failure should not block DB cleanup
      }

      await db.delete(project_documents).where(eq(project_documents.id, docId));
      return success(res, { deleted: true });
    } catch (err) {
      return next(err);
    }
  },
);
