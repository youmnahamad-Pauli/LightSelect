'use client';

import { useState } from 'react';
import { Pencil, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BoqItem, BoqItemStatus, PriceList } from '@/types';
import { BOQItemEditPanel } from './BOQItemEditPanel';

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusVariant(s: BoqItemStatus) {
  if (s === 'locked')   return 'success' as const;
  if (s === 'reviewed') return 'info' as const;
  return 'neutral' as const;
}

function ComplianceChip({ item }: { item: BoqItem }) {
  // No product assigned
  if (!item.product_id) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
        <AlertCircle className="h-3 w-3" />
        No product
      </span>
    );
  }

  const productName = item.selected_product
    ? [item.selected_product.manufacturer, item.selected_product.model_number].filter(Boolean).join(' ')
    : 'Product assigned';

  // Product assigned but no compliance score yet
  if (item.compliance_score == null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-ink truncate max-w-[140px]">{productName}</span>
        <span className="text-xs text-ink-faint italic">Run matches for score</span>
      </div>
    );
  }

  const score = item.compliance_score;
  const pct = Math.round(score * 100);
  const band = score >= 0.80 ? 'Strong' : score >= 0.55 ? 'Acceptable' : 'Weak';
  const color = score >= 0.80 ? 'text-success' : score >= 0.55 ? 'text-info' : 'text-warning';

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-ink truncate max-w-[140px]">{productName}</span>
      <span className={cn('text-xs font-semibold', color)}>{pct}% — {band}</span>
    </div>
  );
}

function PriceCell({ item }: { item: BoqItem }) {
  if (item.unit_price == null) {
    return <span className="text-xs text-ink-faint">—</span>;
  }
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  return (
    <div className="text-right">
      <p className="text-sm font-medium text-ink">{item.currency} {fmt(item.unit_price)}</p>
      {item.total_price != null && (
        <p className="text-xs text-ink-muted">Total: {fmt(item.total_price)}</p>
      )}
    </div>
  );
}

/** Returns a brief attention reason for the row indicator dot, or null if no attention needed. */
function attentionReason(item: BoqItem): string | null {
  if (!item.product_id) return 'No product assigned';
  if (item.compliance_score != null && item.compliance_score < 0.55) return 'Weak spec match';
  if (item.unit_price == null) return 'No pricing';
  return null;
}

// ─── BOQTable ──────────────────────────────────────────────────────────────

interface BOQTableProps {
  items: BoqItem[];
  priceLists: PriceList[];
  onUpdated: (item: BoqItem) => void;
  onDeleted: (id: string) => void;
}

export function BOQTable({ items, priceLists, onUpdated, onDeleted }: BOQTableProps) {
  const { token } = useAuth();
  const [editItem, setEditItem] = useState<BoqItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const needsAttentionCount = items.filter((i) => attentionReason(i) !== null).length;

  async function handleDelete(item: BoqItem) {
    if (!token) return;
    if (!confirm(`Delete "${item.description}"?`)) return;
    setDeleting(item.id);
    try {
      await api.boq.delete(token, item.id);
      onDeleted(item.id);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-sm text-ink-faint">No BOQ items yet.</p>
        <p className="text-xs text-ink-faint mt-1">Add items from spec requirements, or manually.</p>
      </div>
    );
  }

  return (
    <>
      {needsAttentionCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-warning/20 bg-warning-soft/30 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-xs text-warning">
            <strong>{needsAttentionCount} row{needsAttentionCount !== 1 ? 's' : ''}</strong> need attention — missing product, weak match, or no pricing.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="w-2 px-2 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide w-20">Qty</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide">Product / Match</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-ink-faint uppercase tracking-wide">Pricing</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide w-24">Status</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {items.map((item) => {
              const attention = attentionReason(item);
              return (
                <tr key={item.id} className="hover:bg-surface-hover transition-colors">
                  {/* Attention dot */}
                  <td className="px-2 py-3">
                    {attention && (
                      <span
                        className="block h-2 w-2 rounded-full bg-warning"
                        title={attention}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink truncate max-w-[200px]">{item.description}</p>
                    {item.notes && <p className="text-xs text-ink-faint truncate">{item.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {item.quantity} <span className="text-ink-faint">{item.unit}</span>
                  </td>
                  <td className="px-4 py-3">
                    {item.category_name
                      ? <span className="text-xs text-ink-muted">{item.category_name}</span>
                      : <span className="text-xs text-ink-faint">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ComplianceChip item={item} />
                  </td>
                  <td className="px-4 py-3">
                    <PriceCell item={item} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditItem(item)}
                        className="rounded p-1.5 text-ink-faint hover:bg-surface-hover hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleting === item.id}
                        className="rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && items.some((i) => i.total_price != null) && (
            <tfoot className="bg-surface-subtle">
              <tr>
                <td />
                <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">Total</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-ink">
                    {items[0]?.currency ?? 'USD'}{' '}
                    {items
                      .reduce((s, i) => s + (i.total_price ?? 0), 0)
                      .toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editItem && (
        <BOQItemEditPanel
          item={editItem}
          priceLists={priceLists}
          onClose={() => setEditItem(null)}
          onUpdated={(updated) => {
            onUpdated(updated);
            setEditItem(updated);
          }}
        />
      )}
    </>
  );
}
