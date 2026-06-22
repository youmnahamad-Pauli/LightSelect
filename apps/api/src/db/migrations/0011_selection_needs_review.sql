ALTER TABLE "matching_requirements"
  ADD COLUMN IF NOT EXISTS "selection_needs_review" boolean NOT NULL DEFAULT false;
