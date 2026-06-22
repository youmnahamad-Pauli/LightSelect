-- Migration 0012: Submittal templates (document-checklist definitions)
-- Additive: new tables + columns only. Does NOT touch matching/scoring/ingestion.

-- ── submittal_templates ────────────────────────────────────────────────────────
-- Reusable document-checklist definitions, one per consultant or generic.

CREATE TABLE IF NOT EXISTS "submittal_templates" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"            text NOT NULL,
  "consultant"      text,
  "description"     text,
  "is_active"       boolean NOT NULL DEFAULT true,
  "is_example"      boolean NOT NULL DEFAULT false,
  "created_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL
);

-- ── submittal_template_items ───────────────────────────────────────────────────
-- One row = one checklist line: a document type required at project or per-item scope.

CREATE TABLE IF NOT EXISTS "submittal_template_items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id"   uuid NOT NULL REFERENCES "submittal_templates"("id") ON DELETE CASCADE,
  "document_type" text NOT NULL,
  "label"         text NOT NULL,
  "required"      boolean NOT NULL DEFAULT true,
  "scope"         text NOT NULL CHECK ("scope" IN ('project', 'per_item')),
  "sort_order"    integer NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);

-- ── submittal_override_log ─────────────────────────────────────────────────────
-- Audit trail for explicit completeness-gate overrides.

CREATE TABLE IF NOT EXISTS "submittal_override_log" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id"       uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "template_id"      uuid REFERENCES "submittal_templates"("id") ON DELETE SET NULL,
  "missing_items"    text[] NOT NULL,
  "override_reason"  text,
  "overridden_at"    timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Add submittal_template_id to projects ──────────────────────────────────────

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "submittal_template_id" uuid
    REFERENCES "submittal_templates"("id") ON DELETE SET NULL;

-- ── Extend project_documents check constraint ─────────────────────────────────
-- Add compliance_statement (generated doc type, not an upload).

ALTER TABLE "project_documents"
  DROP CONSTRAINT IF EXISTS "project_documents_document_type_check";

ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_document_type_check" CHECK (
    "document_type" IN (
      'compliance_statement',
      'spec', 'boq', 'drawing_dwg', 'submittal_template',
      'test_certificate', 'datasheet', 'trade_licence', 'other'
    )
  );

-- ── Seed: one clearly-marked example template ─────────────────────────────────
-- Seeded with fixed UUIDs so they're stable and referenceable in dev/test.

DO $$
DECLARE
  tmpl_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  INSERT INTO submittal_templates (id, organization_id, name, consultant, description, is_example)
  VALUES (
    tmpl_id,
    NULL,
    'Generic Lighting Submittal',
    'AECOM',
    'Example template — copy and adjust for your project. Covers the standard AECOM document set for a lighting design submittal.',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  -- Project-scope items (one per whole submittal package)
  INSERT INTO submittal_template_items (template_id, document_type, label, required, scope, sort_order)
  VALUES
    (tmpl_id, 'trade_licence',       'Trade Licence / Company Registration',  true,  'project', 10),
    (tmpl_id, 'other',               'Company Profile',                        false, 'project', 20)
  ON CONFLICT DO NOTHING;

  -- Per-item items (one per luminaire schedule item)
  INSERT INTO submittal_template_items (template_id, document_type, label, required, scope, sort_order)
  VALUES
    (tmpl_id, 'compliance_statement', 'AECOM Compliance Statement',            true,  'per_item', 30),
    (tmpl_id, 'datasheet',            'Technical Datasheet',                   true,  'per_item', 40),
    (tmpl_id, 'test_certificate',     'Third-Party Test Certificate (IES/LM)', false, 'per_item', 50)
  ON CONFLICT DO NOTHING;
END $$;
