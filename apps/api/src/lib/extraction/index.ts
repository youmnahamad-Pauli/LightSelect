import type { ExtractionService } from './service';
import { StubExtractionService } from './stub';

let _service: ExtractionService | null = null;

/**
 * Returns the configured extraction service.
 *
 * To swap in a real PDF parser:
 * 1. Set EXTRACTION_ENGINE=real (or any non-'stub' value) in .env
 * 2. Create a RealExtractionService implementing ExtractionService
 * 3. Add it to the else branch below
 */
export function getExtractionService(): ExtractionService {
  if (_service) return _service;
  const engine = process.env.EXTRACTION_ENGINE ?? 'stub';
  if (engine === 'stub') {
    _service = new StubExtractionService();
  } else {
    // Future: real PDF/OCR adapters
    console.warn(`[extraction] Unknown engine "${engine}", falling back to stub`);
    _service = new StubExtractionService();
  }
  return _service;
}

export type { ExtractionService, ExtractionResult, ExtractedAttribute } from './service';
