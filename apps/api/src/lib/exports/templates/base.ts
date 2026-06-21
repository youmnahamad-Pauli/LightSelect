/**
 * Phase 5 exports — template interface.
 *
 * Every consultant template implements ExportTemplate. Templates are
 * registered in registry.ts and selected by consultant key at render time.
 *
 * Templates are pure functions of their inputs: they receive a fully
 * resolved ComplianceStatement and return a file buffer. No DB access.
 */
import type { ComplianceStatement, RenderOptions } from '../types';

export interface ExportTemplate {
  /** Lowercase kebab identifier, e.g. "aecom". Used as the registry key. */
  key: string;
  /** Human-readable name shown in CLI help and API listings. */
  label: string;
  /**
   * Render the statement to a file buffer.
   *
   * @param statement  The normalised compliance data (no DB access inside here)
   * @param options    Optional format/locale hints
   * @returns          File buffer (XLSX bytes, PDF bytes, etc.)
   */
  render(statement: ComplianceStatement, options?: RenderOptions): Promise<Buffer>;
}
