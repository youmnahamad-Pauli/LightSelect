-- Migration 0010: proposed-product selection per requirement
--
-- Adds a stable selection record to matching_requirements so consultants can
-- designate the proposed product for a schedule item independently of which
-- match_decision row happens to be rank-1 after a re-run.
--
-- selected_candidate_type: 'product' (canonical_products row) | 'combo' (delivery_combos row)
-- selected_candidate_id:   UUID of the canonical_products.id OR delivery_combos.id
-- selection_is_override:   true when the selected candidate was disqualified/pending at
--                          selection time and the user explicitly confirmed the override
-- selected_at:             wall-clock timestamp of the selection action

ALTER TABLE "matching_requirements"
  ADD COLUMN IF NOT EXISTS "selected_candidate_type" text
    CONSTRAINT "matching_requirements_selected_candidate_type_check"
    CHECK ("selected_candidate_type" IN ('product', 'combo')),
  ADD COLUMN IF NOT EXISTS "selected_candidate_id" uuid,
  ADD COLUMN IF NOT EXISTS "selection_is_override" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "selected_at" timestamp with time zone;
