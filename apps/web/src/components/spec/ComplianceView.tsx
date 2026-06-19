'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SpecComparisonRun, SpecComparisonResultRow, ComparisonResultStatus } from '@/types';

// ─── Status display ────────────────────────────────────────────────────────

const STATUS_META: Record<
  ComparisonResultStatus,
  { label: string; icon: React.ReactNode; rowClass: string; badgeVariant: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }
> = {
  compliant: {
    label: 'Compliant',
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
    rowClass: 'bg-success-soft/20 border-success/10',
    badgeVariant: 'success',
  },
  deviated: {
    label: 'Deviated',
    icon: <XCircle className="h-4 w-4 text-danger" />,
    rowClass: 'bg-danger-soft/20 border-danger/10',
    badgeVariant: 'danger',
  },
  missing: {
    label: 'Missing',
    icon: <AlertCircle className="h-4 w-4 text-warning" />,
    rowClass: 'bg-warning-soft/20 border-warning/10',
    badgeVariant: 'warning',
  },
  review_needed: {
    label: 'Review',
    icon: <HelpCircle className="h-4 w-4 text-info" />,
    rowClass: 'bg-info-soft/20 border-info/10',
    badgeVariant: 'info',
  },
};

type FilterStatus = ComparisonResultStatus | 'all';

// ─── Override panel ────────────────────────────────────────────────────────

function OverridePanel({
  result,
  onOverridden,
  onCancel,
}: {
  result: SpecComparisonResultRow;
  onOverridden: (updated: SpecComparisonResultRow) => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const [status, setStatus] = useState<ComparisonResultStatus>(result.override_status ?? result.comparison_status);
  const [notes, setNotes] = useState(result.override_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      await api.spec.overrideResult(token, result.id, { override_status: status, override_notes: notes || null });
      onOverridden({ ...result, override_status: status, override_notes: notes || null });
      onCancel();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3 space-y-3">
      <p className="text-xs font-medium text-ink-muted">Override compliance verdict</p>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex items-center gap-3">
        <Select
          options={[
            { value: 'compliant', label: 'Compliant' },
            { value: 'deviated', label: 'Deviated' },
            { value: 'missing', label: 'Missing' },
            { value: 'review_needed', label: 'Review needed' },
          ]}
          value={status}
          onChange={(e) => setStatus(e.target.value as ComparisonResultStatus)}
          className="h-8 text-xs flex-1"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Override reason (optional)"
          className="h-8 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button size="sm" onClick={save} loading={saving}>Save</Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Result row ────────────────────────────────────────────────────────────

function ResultRow({
  result,
  onUpdated,
}: {
  result: SpecComparisonResultRow;
  onUpdated: (r: SpecComparisonResultRow) => void;
}) {
  const [overriding, setOverriding] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const effectiveStatus: ComparisonResultStatus = result.override_status ?? result.comparison_status;
  const meta = STATUS_META[effectiveStatus];
  const isOverridden = !!result.override_status;
  const specValue = `${result.operator} ${result.target_value}${result.target_unit ? ' ' + result.target_unit : ''}`;

  return (
    <div className={cn('rounded-lg border px-4 py-3', meta.rowClass)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{meta.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{result.attribute_label}</span>
            <Badge variant={result.priority === 'mandatory' ? 'danger' : 'neutral'}>
              {result.priority}
            </Badge>
            {result.requirement_group && (
              <span className="text-xs text-ink-faint">{result.requirement_group}</span>
            )}
            {isOverridden && (
              <Badge variant="info">overridden</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
            <span>Spec: <strong className="text-ink">{specValue}</strong></span>
            {result.compared_value && (
              <span>Product: <strong className={cn(effectiveStatus === 'compliant' ? 'text-success' : 'text-danger')}>{result.compared_value}</strong></span>
            )}
            {result.deviation_reason && effectiveStatus !== 'compliant' && (
              <span className="text-ink-faint">{result.deviation_reason}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {result.confidence_score != null && (
            <span className="text-xs text-ink-faint">{Math.round(result.confidence_score * 100)}%</span>
          )}
          <button
            onClick={() => { setExpanded((v) => !v); setOverriding(false); }}
            className="rounded p-1 text-ink-faint hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && !overriding && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <OverridePanel
            result={result}
            onOverridden={(r) => { onUpdated(r); setExpanded(false); }}
            onCancel={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── ComplianceView ────────────────────────────────────────────────────────

interface ComplianceViewProps {
  run: SpecComparisonRun;
  results: SpecComparisonResultRow[];
  onResultUpdated?: (r: SpecComparisonResultRow) => void;
}

export function ComplianceView({ run, results: initialResults, onResultUpdated }: ComplianceViewProps) {
  const [results, setResults] = useState(initialResults);
  const [filter, setFilter] = useState<FilterStatus>('all');

  const total = results.length;
  const counts = {
    compliant: results.filter((r) => (r.override_status ?? r.comparison_status) === 'compliant').length,
    deviated: results.filter((r) => (r.override_status ?? r.comparison_status) === 'deviated').length,
    missing: results.filter((r) => (r.override_status ?? r.comparison_status) === 'missing').length,
    review_needed: results.filter((r) => (r.override_status ?? r.comparison_status) === 'review_needed').length,
  };

  const visible = filter === 'all'
    ? results
    : results.filter((r) => (r.override_status ?? r.comparison_status) === filter);

  function handleUpdated(updated: SpecComparisonResultRow) {
    const next = results.map((r) => (r.id === updated.id ? updated : r));
    setResults(next);
    onResultUpdated?.(updated);
  }

  const pctCompliant = total === 0 ? 0 : Math.round((counts.compliant / total) * 100);

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div className={cn(
        'rounded-xl border px-5 py-4 flex items-center gap-4',
        counts.deviated === 0 && counts.missing === 0
          ? 'border-success/20 bg-success-soft/30'
          : 'border-danger/20 bg-danger-soft/30',
      )}>
        {counts.deviated === 0 && counts.missing === 0
          ? <ShieldCheck className="h-5 w-5 text-success shrink-0" />
          : <AlertCircle className="h-5 w-5 text-danger shrink-0" />
        }
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">
            {counts.deviated === 0 && counts.missing === 0
              ? `All ${total} requirements met`
              : `${counts.deviated + counts.missing} requirement${counts.deviated + counts.missing !== 1 ? 's' : ''} not satisfied`
            }
          </p>
          <p className="text-xs text-ink-muted mt-0.5">
            {pctCompliant}% compliant · {counts.review_needed} need review
          </p>
        </div>

        {/* Mini counts */}
        <div className="hidden sm:flex items-center gap-4 text-xs">
          {(['compliant', 'deviated', 'missing', 'review_needed'] as ComparisonResultStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? 'all' : s)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors',
                filter === s ? 'bg-ink/10' : 'hover:bg-ink/5',
              )}
            >
              {STATUS_META[s].icon}
              <span className="font-semibold text-ink">{counts[s]}</span>
              <span className="text-ink-muted">{STATUS_META[s].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'compliant', 'deviated', 'missing', 'review_needed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'bg-primary text-white'
                : 'bg-surface-subtle text-ink-muted hover:bg-surface-hover',
            )}
          >
            {f === 'all' ? `All (${total})` : `${STATUS_META[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Result rows */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="text-sm text-ink-faint text-center py-8">No results match this filter.</p>
        )}
        {visible.map((result) => (
          <ResultRow key={result.id} result={result} onUpdated={handleUpdated} />
        ))}
      </div>
    </div>
  );
}
