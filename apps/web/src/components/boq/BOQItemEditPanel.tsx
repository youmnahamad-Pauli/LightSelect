'use client';

import { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { CandidateSelector } from './CandidateSelector';
import { cn } from '@/lib/utils';
import type { BoqItem, BoqItemStatus, BoqPricingSource, PriceList } from '@/types';

interface BOQItemEditPanelProps {
  item: BoqItem;
  priceLists: PriceList[];
  onClose: () => void;
  onUpdated: (item: BoqItem) => void;
}

export function BOQItemEditPanel({ item, priceLists, onClose, onUpdated }: BOQItemEditPanelProps) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit,
    notes: item.notes ?? '',
    unit_price: item.unit_price != null ? String(item.unit_price) : '',
    pricing_source: item.pricing_source,
    price_list_id: item.price_list_id ?? '',
    status: item.status,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-sync form when item is updated externally (e.g., after candidate product assignment)
  useEffect(() => {
    setForm({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit,
      notes: item.notes ?? '',
      unit_price: item.unit_price != null ? String(item.unit_price) : '',
      pricing_source: item.pricing_source,
      price_list_id: item.price_list_id ?? '',
      status: item.status,
    });
  }, [item.id, item.updated_at]);

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError('');
    const qty = parseFloat(form.quantity);
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number.'); setSaving(false); return; }

    const up = parseFloat(form.unit_price);
    try {
      const updated = await api.boq.update(token, item.id, {
        description: form.description.trim(),
        quantity: qty,
        unit: form.unit,
        notes: form.notes.trim() || null,
        unit_price: form.unit_price.trim() ? up : null,
        pricing_source: form.pricing_source as BoqPricingSource,
        price_list_id: form.price_list_id || null,
        status: form.status as BoqItemStatus,
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const total = parseFloat(form.quantity) * (parseFloat(form.unit_price) || 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col bg-surface shadow-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Edit BOQ Item</h2>
            <p className="text-xs text-ink-muted mt-0.5 truncate max-w-xs">{item.description}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <Alert variant="error" onDismiss={() => setError('')}>{error}</Alert>}

          {/* Basic fields */}
          <div className="space-y-4">
            <FormField label="Description" required>
              <Input value={form.description} onChange={f('description')} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quantity" required>
                <Input type="number" min="0.01" step="0.01" value={form.quantity} onChange={f('quantity')} />
              </FormField>
              <FormField label="Unit">
                <Select
                  options={[
                    { value: 'pcs', label: 'pcs' },
                    { value: 'sets', label: 'sets' },
                    { value: 'lot', label: 'lot' },
                    { value: 'm', label: 'm (metres)' },
                    { value: 'nr', label: 'nr (number)' },
                  ]}
                  placeholder="pcs"
                  value={form.unit}
                  onChange={f('unit')}
                />
              </FormField>
            </div>
          </div>

          {/* Spec profile summary */}
          {item.required_spec_profile && item.required_spec_profile.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-subtle p-4 space-y-2">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Required Spec Profile</p>
              {item.required_spec_profile.filter((r) => r.priority === 'mandatory').slice(0, 6).map((r) => (
                <div key={r.attribute_key} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-ink-muted shrink-0">{r.attribute_label}</span>
                  <span className="font-mono text-ink-faint">{r.operator}</span>
                  <span className="text-ink font-medium">{r.target_value}{r.target_unit ? ' ' + r.target_unit : ''}</span>
                  <Badge variant="danger" className="text-xs">mandatory</Badge>
                </div>
              ))}
              {item.required_spec_profile.filter((r) => r.priority === 'mandatory').length > 6 && (
                <p className="text-xs text-ink-faint">+{item.required_spec_profile.filter((r) => r.priority === 'mandatory').length - 6} more requirements</p>
              )}
            </div>
          )}

          {/* Candidate selector */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <CandidateSelector item={item} onProductAssigned={onUpdated} />
          </div>

          {/* Pricing */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Pricing</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Pricing source">
                <Select
                  options={[
                    { value: 'none', label: 'None / Not set' },
                    { value: 'price_list', label: 'Price list' },
                    { value: 'manual', label: 'Manual entry' },
                  ]}
                  value={form.pricing_source}
                  onChange={f('pricing_source')}
                />
              </FormField>
              {priceLists.length > 0 && (
                <FormField label="Price list">
                  <Select
                    options={priceLists.map((pl) => ({ value: pl.id, label: pl.name }))}
                    placeholder="Select price list…"
                    value={form.price_list_id}
                    onChange={f('price_list_id')}
                  />
                </FormField>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Unit price">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_price}
                  onChange={f('unit_price')}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Total (computed)">
                <div className="h-9 rounded-lg border border-border bg-surface-subtle px-3 flex items-center text-sm font-medium text-ink">
                  {!isNaN(total) && total > 0 ? total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                </div>
              </FormField>
            </div>
          </div>

          {/* Notes + status */}
          <div className="space-y-3">
            <FormField label="Notes">
              <Textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Optional notes" />
            </FormField>
            <FormField label="Status">
              <Select
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'reviewed', label: 'Reviewed' },
                  { value: 'locked', label: 'Locked' },
                ]}
                value={form.status}
                onChange={f('status')}
              />
            </FormField>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 px-5 py-4 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
