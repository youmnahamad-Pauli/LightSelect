'use client';

import { useState, useEffect } from 'react';
import { Plus, Save, CheckCircle2, AlertCircle, MinusCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ProductAttribute, AttributeValueSource } from '@/types';

// ─── Standard attribute definitions ───────────────────────────────────────

export const STANDARD_ATTRIBUTES: { name: string; label: string; group: string }[] = [
  { name: 'manufacturer', label: 'Manufacturer', group: 'Identity' },
  { name: 'family_name', label: 'Product Family', group: 'Identity' },
  { name: 'model_number', label: 'Model Number', group: 'Identity' },
  { name: 'description', label: 'Description', group: 'Identity' },
  { name: 'application', label: 'Application', group: 'Identity' },
  { name: 'mounting', label: 'Mounting Type', group: 'Physical' },
  { name: 'dimensions', label: 'Dimensions', group: 'Physical' },
  { name: 'weight', label: 'Weight', group: 'Physical' },
  { name: 'material', label: 'Housing Material', group: 'Physical' },
  { name: 'finish', label: 'Finish / Color', group: 'Physical' },
  { name: 'lumens', label: 'Lumens (lm)', group: 'Photometric' },
  { name: 'watts', label: 'Wattage (W)', group: 'Photometric' },
  { name: 'efficacy', label: 'Efficacy (lm/W)', group: 'Photometric' },
  { name: 'cct', label: 'CCT (K)', group: 'Photometric' },
  { name: 'cri', label: 'CRI', group: 'Photometric' },
  { name: 'beam_angle', label: 'Beam Angle / Optic', group: 'Photometric' },
  { name: 'ip_rating', label: 'IP Rating', group: 'Compliance' },
  { name: 'ik_rating', label: 'IK Rating', group: 'Compliance' },
  { name: 'certifications', label: 'Certifications', group: 'Compliance' },
  { name: 'voltage', label: 'Input Voltage', group: 'Electrical' },
  { name: 'dimming', label: 'Dimming / Driver', group: 'Electrical' },
  { name: 'operating_temp', label: 'Operating Temperature', group: 'Electrical' },
  { name: 'lifetime_hours', label: 'Lifetime (hours)', group: 'Performance' },
  { name: 'warranty', label: 'Warranty', group: 'Performance' },
  { name: 'accessories', label: 'Accessories', group: 'Performance' },
  { name: 'notes', label: 'Notes', group: 'Performance' },
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface AttributeRow {
  name: string;
  label: string;
  group: string;
  value: string;
  source: AttributeValueSource;
  existingId?: string;
  isDirty: boolean;
  isCustom: boolean;
  confidence?: number | null;
}

// ─── Row status indicator ──────────────────────────────────────────────────

function StatusDot({ row }: { row: AttributeRow }) {
  if (row.source === 'na') {
    return <MinusCircle className="h-4 w-4 text-slate-400" title="Marked as N/A" />;
  }
  if (row.source === 'extracted') {
    const pct = row.confidence != null ? Math.round(row.confidence * 100) : null;
    return (
      <span className="flex items-center gap-1 text-xs text-sky-600" title={`Extracted${pct != null ? ` (${pct}% confidence)` : ''}`}>
        <Sparkles className="h-4 w-4" />
        {pct != null && <span>{pct}%</span>}
      </span>
    );
  }
  if (row.value.trim()) {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" title="Value set" />;
  }
  return <AlertCircle className="h-4 w-4 text-amber-400" title="No value set" />;
}

// ─── Single attribute row ──────────────────────────────────────────────────

interface AttributeRowProps {
  row: AttributeRow;
  onChange: (patch: Partial<AttributeRow>) => void;
}

function AttributeRowComp({ row, onChange }: AttributeRowProps) {
  const isNa = row.source === 'na';
  const isExtracted = row.source === 'extracted';

  return (
    <div className={cn('grid grid-cols-[180px_1fr_100px_32px] items-center gap-2 py-1.5 border-b border-slate-100 last:border-0', row.isDirty && 'bg-brand/5 rounded')}>
      {/* Label */}
      <span className={cn('text-sm truncate', row.isCustom ? 'text-slate-500 italic' : 'text-slate-700')}>
        {row.label}
      </span>

      {/* Value input */}
      <input
        type="text"
        value={isNa ? '' : row.value}
        disabled={isNa}
        placeholder={isNa ? 'N/A' : isExtracted ? 'Extracted...' : 'Enter value...'}
        onChange={(e) => onChange({ value: e.target.value, isDirty: true })}
        className={cn(
          'block w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1',
          isNa
            ? 'border-slate-100 bg-slate-50 text-slate-400 placeholder-slate-400'
            : isExtracted
              ? 'border-sky-200 bg-sky-50 text-slate-800 focus:border-sky-400 focus:ring-sky-300'
              : 'border-slate-200 bg-white text-slate-800 focus:border-brand focus:ring-brand',
        )}
      />

      {/* Source selector */}
      <select
        value={row.source === 'extracted' ? 'extracted' : row.source}
        onChange={(e) => {
          const src = e.target.value as AttributeValueSource;
          onChange({ source: src, isDirty: true, value: src === 'na' ? '' : row.value });
        }}
        disabled={isExtracted}
        className={cn(
          'rounded border px-1.5 py-1 text-xs focus:outline-none focus:ring-1 disabled:cursor-not-allowed',
          isExtracted
            ? 'border-sky-200 bg-sky-50 text-sky-700'
            : 'border-slate-200 bg-white text-slate-600 focus:border-brand focus:ring-brand',
        )}
      >
        <option value="manual">Manual</option>
        <option value="na">N/A</option>
        {isExtracted && <option value="extracted">Extracted</option>}
      </select>

      {/* Status */}
      <div className="flex items-center justify-center">
        <StatusDot row={row} />
      </div>
    </div>
  );
}

// ─── AttributeEditor ───────────────────────────────────────────────────────

interface AttributeEditorProps {
  productId: string;
  initialAttributes: ProductAttribute[];
  onSaved?: (attrs: ProductAttribute[]) => void;
}

export function AttributeEditor({ productId, initialAttributes, onSaved }: AttributeEditorProps) {
  const { token } = useAuth();
  const [rows, setRows] = useState<AttributeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  // Custom attribute add form
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customValue, setCustomValue] = useState('');

  // Merge standard attributes with fetched data
  useEffect(() => {
    const byName = new Map(initialAttributes.map((a) => [a.attribute_name, a]));

    const standardRows: AttributeRow[] = STANDARD_ATTRIBUTES.map((s) => {
      const existing = byName.get(s.name);
      return {
        name: s.name,
        label: s.label,
        group: s.group,
        value: existing?.attribute_value ?? '',
        source: existing?.value_source ?? 'manual',
        existingId: existing?.id,
        isDirty: false,
        isCustom: false,
        confidence: existing?.confidence_score,
      };
    });

    // Custom attributes (in DB but not in standard list)
    const customRows: AttributeRow[] = initialAttributes
      .filter((a) => !STANDARD_ATTRIBUTES.find((s) => s.name === a.attribute_name))
      .map((a) => ({
        name: a.attribute_name,
        label: a.attribute_name,
        group: 'Custom',
        value: a.attribute_value ?? '',
        source: a.value_source,
        existingId: a.id,
        isDirty: false,
        isCustom: true,
        confidence: a.confidence_score,
      }));

    setRows([...standardRows, ...customRows]);
  }, [initialAttributes]);

  function updateRow(name: string, patch: Partial<AttributeRow>) {
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...patch } : r)));
    setSavedOk(false);
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setSaveError('');
    setSavedOk(false);

    // Save all rows (not just dirty — so new products get their initial state saved)
    const payload = rows.map((r) => ({
      attribute_name: r.name,
      attribute_value: r.source === 'na' ? null : r.value.trim() || null,
      value_source: r.source,
    }));

    try {
      const updated = await api.products.saveAttributes(token, productId, { attributes: payload });
      onSaved?.(updated);
      setRows((prev) => prev.map((r) => ({ ...r, isDirty: false })));
      setSavedOk(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save attributes.');
    } finally {
      setSaving(false);
    }
  }

  function addCustomAttribute() {
    if (!customName.trim()) return;
    if (rows.find((r) => r.name === customName.trim())) return;
    const newRow: AttributeRow = {
      name: customName.trim(),
      label: customName.trim(),
      group: 'Custom',
      value: customValue.trim(),
      source: 'manual',
      isDirty: true,
      isCustom: true,
    };
    setRows((prev) => [...prev, newRow]);
    setCustomName('');
    setCustomValue('');
    setAddingCustom(false);
    setSavedOk(false);
  }

  const hasDirty = rows.some((r) => r.isDirty);
  const filledCount = rows.filter((r) => r.source === 'na' || r.value.trim()).length;
  const standardCount = rows.filter((r) => !r.isCustom).length;

  // Group rows for display
  const groups = Array.from(new Set(rows.map((r) => r.group)));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Technical Attributes
            <span className="ml-2 text-xs font-normal text-slate-400">
              {filledCount} / {standardCount} filled
            </span>
          </p>
          <p className="text-xs text-slate-400">
            Mark unknown values as N/A. Extracted values from PDFs appear in blue (read-only until confirmed).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedOk && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>}
          <Button size="sm" onClick={save} loading={saving}>
            <Save className="h-3.5 w-3.5" />
            Save Attributes
          </Button>
        </div>
      </div>

      {saveError && <Alert variant="error">{saveError}</Alert>}

      {/* Column headers */}
      <div className="grid grid-cols-[180px_1fr_100px_32px] gap-2 px-0 pb-1 border-b-2 border-slate-200">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attribute</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Value</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 text-center">OK</span>
      </div>

      {/* Attribute rows by group */}
      {groups.map((group) => {
        const groupRows = rows.filter((r) => r.group === group);
        return (
          <div key={group}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1 mt-3 first:mt-0">
              {group}
            </p>
            {groupRows.map((row) => (
              <AttributeRowComp
                key={row.name}
                row={row}
                onChange={(patch) => updateRow(row.name, patch)}
              />
            ))}
          </div>
        );
      })}

      {/* Add custom attribute */}
      <div className="pt-2 border-t border-slate-100">
        {addingCustom ? (
          <div className="flex items-center gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Attribute name"
              className="w-44"
              autoFocus
            />
            <Input
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Value (optional)"
              className="flex-1"
            />
            <Button size="sm" onClick={addCustomAttribute}>Add</Button>
            <Button size="sm" variant="secondary" onClick={() => setAddingCustom(false)}>Cancel</Button>
          </div>
        ) : (
          <button
            onClick={() => setAddingCustom(true)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add custom attribute
          </button>
        )}
      </div>
    </div>
  );
}
