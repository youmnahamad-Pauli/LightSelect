'use client';

import { useState } from 'react';
import {
  CheckCircle2, XCircle, AlertCircle, HelpCircle, Zap,
  Star, Ban, Building2, Globe,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { BoqItem, CandidateEntry, MatchBand } from '@/types';

// ─── Match band helpers ────────────────────────────────────────────────────

const BAND_META: Record<MatchBand, { label: string; color: string; badgeVariant: 'success' | 'info' | 'warning' | 'neutral' }> = {
  strong:     { label: 'Strong',      color: 'text-success',  badgeVariant: 'success' },
  acceptable: { label: 'Acceptable',  color: 'text-info',     badgeVariant: 'info'    },
  weak:       { label: 'Weak',        color: 'text-warning',  badgeVariant: 'warning' },
  none:       { label: 'No match',    color: 'text-ink-faint',badgeVariant: 'neutral' },
};

function MatchScoreChip({ candidate }: { candidate: CandidateEntry }) {
  if (candidate.match_score == null) {
    // Legacy: fall back to compliance_score
    const pct = Math.round(candidate.compliance_score * 100);
    const color = pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger';
    return <span className={cn('text-xs font-semibold tabular-nums', color)}>{pct}%</span>;
  }
  const pct = Math.round(candidate.match_score * 100);
  const band = candidate.match_band ?? 'none';
  const meta = BAND_META[band];
  return (
    <span className={cn('text-sm font-bold tabular-nums', meta.color)}>
      {pct}%
      <span className="ml-1 text-xs font-medium opacity-70">{meta.label}</span>
    </span>
  );
}

function ScopeChip({ candidate }: { candidate: CandidateEntry }) {
  if (candidate.is_from_current_project == null) return null;
  return candidate.is_from_current_project ? (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Building2 className="h-3 w-3" />
      This project
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
      <Globe className="h-3 w-3" />
      Workspace
    </span>
  );
}

// ─── Attribute explanation chips ───────────────────────────────────────────

function AttributeChips({ candidate }: { candidate: CandidateEntry }) {
  const matched = candidate.matched_attributes ?? [];
  const deviated = candidate.deviated_attributes ?? [];
  const missing = candidate.missing_attributes ?? [];

  if (matched.length === 0 && deviated.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {matched.slice(0, 4).map((a) => (
        <span
          key={a.key}
          className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success"
          title={`${a.label}: ${a.value}`}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {a.value.length > 12 ? a.value.slice(0, 12) + '…' : a.value}
        </span>
      ))}
      {deviated.slice(0, 2).map((a) => (
        <span
          key={a.key}
          className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger"
          title={`${a.label}: got ${a.product_value}, spec requires ${a.spec_requirement}`}
        >
          <XCircle className="h-3 w-3 shrink-0" />
          {a.label.split(' ')[0]}
        </span>
      ))}
      {missing.length > 0 && (
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-ink-faint">
          {missing.length} missing
        </span>
      )}
    </div>
  );
}

// ─── Deviation detail panel ────────────────────────────────────────────────

function DeviationDetail({ candidate }: { candidate: CandidateEntry }) {
  const deviated = candidate.deviated_attributes ?? [];
  const missing = candidate.missing_attributes ?? [];

  if (deviated.length === 0 && missing.length === 0) return null;

  return (
    <div className="mt-2.5 rounded-lg border border-border bg-surface-subtle p-2.5 space-y-1.5">
      {deviated.map((a) => (
        <div key={a.key} className="flex items-start gap-2 text-xs">
          <XCircle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-ink">{a.label}:</span>{' '}
            <span className="text-ink-muted">product has <strong>{a.product_value}</strong>, requires <strong>{a.spec_requirement}</strong></span>
          </div>
        </div>
      ))}
      {missing.map((a) => (
        <div key={a.key} className="flex items-start gap-2 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-ink">{a.label}:</span>{' '}
            <span className="text-ink-muted">not in product data, spec requires <strong>{a.spec_requirement}</strong></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CandidateSelector ─────────────────────────────────────────────────────

interface CandidateSelectorProps {
  item: BoqItem;
  onProductAssigned: (updatedItem: BoqItem) => void;
}

export function CandidateSelector({ item, onProductAssigned }: CandidateSelectorProps) {
  const { token } = useAuth();
  const [running, setRunning] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<CandidateEntry[]>(item.candidate_product_ids ?? []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function runSuggestion() {
    if (!token) return;
    setRunning(true);
    setError('');
    try {
      const result = await api.boq.suggestCandidates(token, item.id);
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        setError('No workspace products found matching this BOQ item. Add products in the Products tab first.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suggestion failed.');
    } finally {
      setRunning(false);
    }
  }

  async function assignProduct(productId: string | null) {
    if (!token) return;
    setAssigning(productId ?? 'none');
    setError('');
    try {
      const updated = await api.boq.assignProduct(token, item.id, { product_id: productId });
      onProductAssigned(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Assignment failed.');
    } finally {
      setAssigning(null);
    }
  }

  const isSelected = (productId: string) => item.product_id === productId;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
            Candidate Products
          </p>
          <p className="text-xs text-ink-faint mt-0.5">
            Based on workspace products — no manufacturer catalog used.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={runSuggestion} loading={running}>
          <Zap className="h-3.5 w-3.5" />
          Find Matches
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {candidates.length === 0 && !running && (
        <div className="rounded-xl border border-dashed border-border py-6 text-center">
          <p className="text-sm text-ink-faint">
            Click <strong>Find Matches</strong> to score workspace products against this BOQ item's spec requirements.
          </p>
        </div>
      )}

      {candidates.map((c) => {
        const selected = isSelected(c.product_id);
        const expanded = expandedId === c.product_id;
        const band = c.match_band ?? 'none';

        return (
          <div
            key={c.product_id}
            className={cn(
              'rounded-xl border transition-colors',
              selected
                ? 'border-success/30 bg-success-soft/20'
                : band === 'strong'
                  ? 'border-success/10 bg-surface'
                  : band === 'weak' || band === 'none'
                    ? 'border-border bg-surface/60'
                    : 'border-border bg-surface',
            )}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              {/* Main info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink truncate">{c.product_label}</p>
                  {c.is_preferred && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-warning">
                      <Star className="h-3 w-3" />
                      Preferred
                    </span>
                  )}
                  {selected && <Badge variant="success">Selected</Badge>}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <MatchScoreChip candidate={c} />
                  <ScopeChip candidate={c} />
                  {/* Legacy status icons for backward compat */}
                  {c.matched_attributes == null && (
                    <div className="flex items-center gap-1 text-xs">
                      {c.compliant_count > 0 && <span className="text-success">{c.compliant_count}✓</span>}
                      {c.deviated_count > 0 && <span className="text-danger">{c.deviated_count}✗</span>}
                      {c.missing_count > 0 && <span className="text-warning">{c.missing_count}?</span>}
                    </div>
                  )}
                </div>

                <AttributeChips candidate={c} />
              </div>

              {/* Actions */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Button
                  size="sm"
                  variant={selected ? 'secondary' : 'primary'}
                  loading={assigning === c.product_id}
                  onClick={() => assignProduct(selected ? null : c.product_id)}
                >
                  {selected ? 'Remove' : 'Select'}
                </Button>
                {(c.deviated_attributes?.length || c.missing_attributes?.length) ? (
                  <button
                    onClick={() => setExpandedId(expanded ? null : c.product_id)}
                    className="text-xs text-ink-faint hover:text-ink transition-colors"
                  >
                    {expanded ? 'Hide details ↑' : 'Why weak? ↓'}
                  </button>
                ) : null}
              </div>
            </div>

            {expanded && (
              <div className="border-t border-border/40 px-4 pb-3">
                <DeviationDetail candidate={c} />
              </div>
            )}
          </div>
        );
      })}

      {/* Selected product not in candidates */}
      {item.product_id && !candidates.find((c) => c.product_id === item.product_id) && (
        <div className="rounded-xl border border-success/30 bg-success-soft/20 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {item.selected_product
                  ? [item.selected_product.manufacturer, item.selected_product.model_number].filter(Boolean).join(' — ')
                  : 'Selected product'}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">Manually selected — run matches to compare</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">Selected</Badge>
              <Button size="sm" variant="secondary" loading={assigning === 'none'} onClick={() => assignProduct(null)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
