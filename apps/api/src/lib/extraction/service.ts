export interface ExtractedAttribute {
  attribute_name: string;
  attribute_value: string;
  confidence_score: number; // 0.0 (low) to 1.0 (high)
}

export interface ExtractionResult {
  attributes: ExtractedAttribute[];
  raw_output: Record<string, unknown>;
}

export interface ExtractionService {
  /** Human-readable name surfaced in extraction job records. */
  readonly name: string;

  extract(params: {
    fileId: string;
    /** Absolute path on disk, if available (null for S3 files without local cache). */
    filePath: string | null;
    mimeType: string | null;
  }): Promise<ExtractionResult>;
}
