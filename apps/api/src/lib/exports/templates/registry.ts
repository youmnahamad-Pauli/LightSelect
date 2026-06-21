/**
 * Phase 5 exports — template registry.
 *
 * Templates register themselves here. Selecting a consultant key picks the
 * template; renderStatement() is the single call site for all rendering.
 *
 * To add a new template:
 *   1. Implement ExportTemplate in a new file.
 *   2. Import it below and call registerTemplate(new YourTemplate()).
 */
import type { ExportTemplate } from './base';
import type { ComplianceStatement, RenderOptions } from '../types';
import { AecomXlsxTemplate } from './aecom-xlsx';

// ─── Registry ─────────────────────────────────────────────────────────────────

const _registry = new Map<string, ExportTemplate>();

function registerTemplate(template: ExportTemplate): void {
  _registry.set(template.key.toLowerCase(), template);
}

// ─── Built-in registrations ───────────────────────────────────────────────────

registerTemplate(new AecomXlsxTemplate());

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTemplate(key: string): ExportTemplate | undefined {
  return _registry.get(key.toLowerCase());
}

export function listTemplates(): { key: string; label: string }[] {
  return Array.from(_registry.values()).map((t) => ({ key: t.key, label: t.label }));
}

/**
 * Render a ComplianceStatement using the named consultant template.
 *
 * @param statement     The normalised spine data
 * @param consultantKey Lowercase key, e.g. "aecom"
 * @param options       Optional format/locale hints passed through to the template
 * @returns             File buffer (XLSX or PDF bytes)
 */
export async function renderStatement(
  statement: ComplianceStatement,
  consultantKey: string,
  options?: RenderOptions,
): Promise<Buffer> {
  const template = _registry.get(consultantKey.toLowerCase());
  if (!template) {
    const available = listTemplates().map((t) => t.key).join(', ');
    throw new Error(
      `No template registered for consultant "${consultantKey}". Available: ${available}`,
    );
  }
  return template.render(statement, options);
}
