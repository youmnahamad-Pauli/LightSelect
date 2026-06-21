CREATE TABLE IF NOT EXISTS "match_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"canonical_product_id" uuid NOT NULL,
	"passed_all_hard_gates" boolean,
	"gate_failures" jsonb,
	"soft_gate_comments" jsonb,
	"fit_score" real,
	"is_fit_capped" boolean DEFAULT false NOT NULL,
	"fit_cap_reason" text,
	"confidence_score" real,
	"confidence_band" text,
	"deviations_high_weight" integer DEFAULT 0 NOT NULL,
	"deviations_medium_weight" integer DEFAULT 0 NOT NULL,
	"deviations_low_weight" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"status" text DEFAULT 'evaluated' NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_decision_id" uuid NOT NULL,
	"attribute_key" text NOT NULL,
	"required_value" text,
	"required_operator" text,
	"product_value" text,
	"provenance" text,
	"verdict" text NOT NULL,
	"is_gate" boolean DEFAULT false NOT NULL,
	"gate_type" text,
	"weight" real,
	"score" real,
	"weighted_score" real,
	"evidence_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matching_requirement_attrs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"attribute_key" text NOT NULL,
	"operator" text NOT NULL,
	"target_value" text NOT NULL,
	"target_unit" text,
	"tolerance_tight_pct" real,
	"tolerance_outer_pct" real,
	"gate_type" text,
	"weight" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matching_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"luminaire_type" text NOT NULL,
	"description" text,
	"approvals_required" text[],
	"flag_wind_load" boolean DEFAULT false NOT NULL,
	"flag_dark_sky" boolean DEFAULT false NOT NULL,
	"flag_bend_radius" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canonical_products" ADD COLUMN "luminaire_type" text;--> statement-breakpoint
ALTER TABLE "canonical_products" ADD COLUMN "approvals_held" text[];--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD COLUMN "provenance_state" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_decisions" ADD CONSTRAINT "match_decisions_requirement_id_matching_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."matching_requirements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_decisions" ADD CONSTRAINT "match_decisions_canonical_product_id_canonical_products_id_fk" FOREIGN KEY ("canonical_product_id") REFERENCES "public"."canonical_products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_evidence" ADD CONSTRAINT "match_evidence_match_decision_id_match_decisions_id_fk" FOREIGN KEY ("match_decision_id") REFERENCES "public"."match_decisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matching_requirement_attrs" ADD CONSTRAINT "matching_requirement_attrs_requirement_id_matching_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."matching_requirements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matching_requirements" ADD CONSTRAINT "matching_requirements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matching_requirements" ADD CONSTRAINT "matching_requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_decisions_req_product_idx" ON "match_decisions" USING btree ("requirement_id","canonical_product_id");