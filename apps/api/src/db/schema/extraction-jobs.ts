import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { project_files } from './project-files';
import { products } from './products';

export const extractionJobStatuses = ['queued', 'processing', 'completed', 'failed'] as const;
export type ExtractionJobStatus = (typeof extractionJobStatuses)[number];

export const parserTypes = ['stub', 'pdf', 'ocr'] as const;
export type ParserType = (typeof parserTypes)[number];

export const extraction_jobs = pgTable('extraction_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_file_id: uuid('project_file_id')
    .notNull()
    .references(() => project_files.id, { onDelete: 'cascade' }),
  /** The product attributes were written to. Null if product was not linked at extraction time. */
  product_id: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  status: text('status').$type<ExtractionJobStatus>().notNull().default('queued'),
  parser_type: text('parser_type').$type<ParserType>().notNull().default('stub'),
  /** Number of attribute rows that were successfully extracted. */
  extracted_count: integer('extracted_count'),
  /** Full raw parser output, stored for debugging and future re-processing. */
  raw_output: jsonb('raw_output'),
  error_message: text('error_message'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ExtractionJob = typeof extraction_jobs.$inferSelect;
