import type { ExtractionService } from './service';
import { StubExtractionService } from './stub';
import { ClaudeExtractionService } from './claude';

let _service: ExtractionService | null = null;

/**
 * Returns the configured extraction service.
 *
 * EXTRACTION_ENGINE values:
 *   stub   — deterministic mock (default, no API key needed)
 *   claude — real PDF extraction via Anthropic Messages API (requires ANTHROPIC_API_KEY)
 */
export function getExtractionService(): ExtractionService {
  if (_service) return _service;
  const engine = process.env.EXTRACTION_ENGINE ?? 'stub';
  if (engine === 'stub') {
    _service = new StubExtractionService();
  } else if (engine === 'claude') {
    _service = new ClaudeExtractionService();
  } else {
    console.warn(`[extraction] Unknown engine "${engine}", falling back to stub`);
    _service = new StubExtractionService();
  }
  return _service;
}

export type { ExtractionService, ExtractionResult, ExtractedAttribute } from './service';
