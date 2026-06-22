-- Migration 0009: project-scoped requirement idempotency + planned_submittal_date
--
-- 1. Enforce uniqueness of (org_id, project_id, item_code) for project-scoped
--    requirements, and (org_id, item_code) for org-level (unscoped) ones.
--    Partial indexes keep NULL project_ids out of the first constraint and
--    vice versa.  item_code NULLs are excluded from both (unnamed items are
--    never unique by code).
--
-- 2. Add planned_submittal_date to projects (nullable date — human decision
--    per the increment-1 report).

CREATE UNIQUE INDEX IF NOT EXISTS "uq_req_org_project_item"
  ON "matching_requirements" ("org_id", "project_id", "item_code")
  WHERE "project_id" IS NOT NULL AND "item_code" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_req_org_item_noproj"
  ON "matching_requirements" ("org_id", "item_code")
  WHERE "project_id" IS NULL AND "item_code" IS NOT NULL;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "planned_submittal_date" date;
