import { pgTable, uuid, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { organizations } from './organizations';

export const fileUploadStatuses = ['pending', 'uploaded', 'failed'] as const;
export type FileUploadStatus = (typeof fileUploadStatuses)[number];

export const files = pgTable('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  uploaded_by: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  original_file_name: text('original_file_name').notNull(),
  stored_file_name: text('stored_file_name').notNull(),
  storage_path: text('storage_path').notNull(),
  mime_type: text('mime_type'),
  file_size_bytes: bigint('file_size_bytes', { mode: 'number' }),
  checksum: text('checksum'),
  upload_status: text('upload_status').$type<FileUploadStatus>().notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UploadedFileRecord = typeof files.$inferSelect;
export type NewUploadedFile = typeof files.$inferInsert;
