/**
 * Shared types for the catalogue ingestion pipeline.
 *
 * The pipeline is generic — it works with any lighting catalogue PDF and any
 * manufacturer. No layout or brand assumptions are made here.
 */

/** One product detected by the LLM from the catalogue PDF. */
export interface DetectedProduct {
  /** Brand / manufacturer name as printed in the catalogue. */
  manufacturer: string;
  /** Order / model code. Null when the catalogue does not include one. */
  model_code: string | null;
  /** Descriptive product name. */
  product_name: string;
  /** 1-indexed page range [first, last] where this product's data appears. */
  pages: [number, number];
  /** Extracted attributes: attribute_name → { value, confidence }. */
  attributes: Record<string, { value: string; confidence: number }>;
}

/** Raw response from the catalogue detection LLM call. */
export interface CatalogueDetectionResponse {
  products: DetectedProduct[];
  /** Model / token metadata from the API call. */
  meta: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    elapsed_ms: number;
  };
}

/** What happened to one product after writing to the registry. */
export interface IngestionProductResult {
  canonical_product_id: string;
  manufacturer: string;
  model_code: string | null;
  display_name: string;
  review_status: 'auto_merged' | 'needs_review';
  pages: [number, number];
  attributes_written: number;
  /** Skipped because the attribute name was not in the standard schema. */
  attributes_skipped: number;
  /** True if this matched an existing canonical product (dedup merge). */
  merged_into_existing: boolean;
}

/** The result of running the full pipeline on one catalogue PDF. */
export interface CatalogueIngestionResult {
  source_file: string;
  ingested_at: string;
  org_id: string;
  products_detected: number;
  products_written: number;
  total_attribute_values: number;
  products: IngestionProductResult[];
  llm_meta: CatalogueDetectionResponse['meta'];
}

/** Options passed to runCatalogueIngestion(). */
export interface IngestionOptions {
  /** Absolute path to the catalogue PDF. */
  pdfPath: string;
  /** The org this catalogue is ingested for. */
  orgId: string;
  /** Restrict extraction to products whose model_code matches any of these strings (case-insensitive substring). Empty = all products. */
  modelFilter?: string[];
  /** Override the extraction model. Defaults to EXTRACTION_MODEL env var or claude-sonnet-4-6. */
  model?: string;
}
