-- Migration 0008: project_documents table
-- Stores uploaded documents per project (spec, BOQ, DWG, submittals, etc.)
-- DWG files are stored as drawing_dwg type and never processed.

CREATE TABLE IF NOT EXISTS "project_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "original_filename" text NOT NULL,
  "stored_path" text NOT NULL,
  "mime_type" text,
  "file_size_bytes" integer,
  "document_type" text NOT NULL DEFAULT 'other',
  "item_id" uuid,
  "product_id" uuid,
  "metadata" jsonb,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_documents_document_type_check" CHECK (
    "document_type" IN (
      'spec', 'boq', 'drawing_dwg', 'submittal_template',
      'test_certificate', 'datasheet', 'trade_licence', 'other'
    )
  )
);
