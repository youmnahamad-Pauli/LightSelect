'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, ChevronRight, AlertTriangle, XCircle, MinusCircle,
  CheckCircle2, Download,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FitBar } from '@/components/matching/FitBar';
import { ConfidencePill } from '@/components/matching/ConfidencePill';
import type { MatchingRequirement, MatchDecisionSummary, SelectionState } from '@/types';

function DeviationProfile({ h, m, l }: { h: number; m: number; l: number }) {
  if (h === 0 && m === 0 && l === 0) return <span className="text-xs text-ink-faint">None</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
      {h > 0 && <span className="font-medium text-danger">{h}H</span>}
      {m > 0 && <span className="font-medium text-warning">{m}M</span>}
      {l > 0 && <span className="text-ink-muted">{l}L</span>}
    </span>
  );
}

function SelectionModeBadge({ state }: { state: SelectionState | null }) {
  if (!state || state.mode === 'no_candidates') return null;
  if (state.needs_review) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        selection needs review
      </span>
    );
  }
  if (state.mode === 'override') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        override: {state.resolved_display_name ?? ''}
      </span>
    );
  }
  if (state.mode === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        selected: {state.resolved_display_name ?? ''}
      </span>
    );
  }
  // auto
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
      auto: {state.resolved_display_name ?? '(rank 1)'}
    </span>
  );
}

export default function RequirementResultsPage({ params }: { params: { requirementId: string } }) {
  const router = useRouter();
  const { token, organization } = useAuth();
  const [requirement, setRequirement] = useState<MatchingRequirement | null>(null);
  const [decisions, setDecisions] = useState<MatchDecisionSummary[]>([]);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null); // canonical_product_id being set
  const [overrideConfirm, setOverrideConfirm] = useState<{
    canonicalProductId: string;
    displayName: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      const reqData = await api.matching.listRequirements(token, organization.id);
      const req = reqData.requirements.find((r) => r.id === params.requirementId) ?? null;
      setRequirement(req);

      const decData = await api.matching.listDecisions(token, params.requirementId);
      setDecisions(decData.decisions);

      const sel = await api.matching.resolveSelection(token, params.requirementId);
      setSelection(sel);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load results.');
    } finally {
      setLoading(false);
    }
  }, [token, organization?.id, params.requirementId]);

  useEffect(() => { load(); }, [load]);

  async function handleRerun() {
    if (!token) return;
    setRerunning(true);
    try {
      await api.matching.rerun(token, params.requirementId);
      await load();
    } catch {
      // silently retry
    } finally {
      setRerunning(false);
    }
  }

  async function handleSelect(d: MatchDecisionSummary, force = false) {
    if (!token) return;
    const pid = d.canonical_product_id;

    // Non-assessed candidates require override confirmation
    if (!force && (d.status === 'disqualified' || d.status === 'pending_characterisation')) {
      setOverrideConfirm({ canonicalProductId: pid, displayName: d.display_name ?? pid, status: d.status });
      return;
    }

    setSelecting(pid);
    try {
      const result = await api.matching.setSelection(token, params.requirementId, pid, force);
      setSelection(result.selection);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Selection failed');
    } finally {
      setSelecting(null);
      setOverrideConfirm(null);
    }
  }

  async function handleClearSelection() {
    if (!token) return;
    try {
      const result = await api.matching.clearSelection(token, params.requirementId);
      setSelection(result.selection);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Clear selection failed');
    }
  }

  const ranked       = decisions.filter((d) => d.status === 'evaluated').sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const pending      = decisions.filter((d) => d.status === 'pending_characterisation');
  const disqualified = decisions.filter((d) => d.status === 'disqualified');
  const excluded     = decisions.filter((d) => d.status === 'excluded');

  const isCurrentSelection = (d: MatchDecisionSummary) =>
    selection?.selected_canonical_product_id === d.canonical_product_id ||
    (selection?.mode === 'auto' && selection?.resolved_canonical_product_id === d.canonical_product_id && !selection.selected_canonical_product_id);

  return (
    <div className="space-y-6">
      {/* Override confirm dialog */}
      {overrideConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-ink">Select non-assessed candidate?</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  <strong>{overrideConfirm.displayName}</strong> is currently{' '}
                  <span className="font-mono text-danger">{overrideConfirm.status}</span>.
                  Selecting it will flag this item as an override and it will appear with a
                  warning badge on the schedule. The AECOM export will include an override note.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOverrideConfirm(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={selecting === overrideConfirm.canonicalProductId}
                onClick={() => handleSelect(
                  decisions.find((d) => d.canonical_product_id === overrideConfirm.canonicalProductId)!,
                  true,
                )}
                className="bg-amber-500 hover:bg-amber-600 text-white border-0"
              >
                Confirm override
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-ink">
            {loading ? 'Loading…' : requirement?.name ?? 'Requirement'}
          </h1>
          {requirement?.description && (
            <p className="mt-0.5 text-sm text-ink-muted">{requirement.description}</p>
          )}
          {requirement && (
            <Badge variant="neutral" className="mt-2">{requirement.luminaire_type}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" loading={rerunning} onClick={handleRerun}>
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run
          </Button>
          {!loading && (
            <a
              href={api.matching.aecomExportUrl(params.requirementId)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
              download
            >
              <Download className="h-3.5 w-3.5" />
              AECOM XLSX
            </a>
          )}
        </div>
      </div>

      {/* Selection state */}
      {!loading && selection && (
        <div className="flex items-center gap-3">
          <SelectionModeBadge state={selection} />
          {selection.mode !== 'auto' && selection.mode !== 'no_candidates' && (
            <button
              onClick={handleClearSelection}
              className="text-xs text-ink-muted hover:text-danger transition-colors"
            >
              clear selection
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── Ranked candidates ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Ranked Candidates</CardTitle>
          <span className="text-xs text-ink-muted">{ranked.length} product{ranked.length !== 1 ? 's' : ''} scored</span>
        </CardHeader>

        {loading && (
          <CardContent>
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-surface-subtle animate-pulse" />
              ))}
            </div>
          </CardContent>
        )}

        {!loading && ranked.length === 0 && (
          <CardContent>
            <p className="text-sm text-ink-muted">No products passed all gates.</p>
          </CardContent>
        )}

        {!loading && ranked.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-muted w-10">Rank</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Product</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Fit</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Confidence</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Deviations</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Comments</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted w-28">Proposed</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {ranked.map((d) => {
                  const isCurrent = isCurrentSelection(d);
                  return (
                    <tr
                      key={d.id}
                      className={`transition-colors ${isCurrent ? 'bg-emerald-50/60' : 'hover:bg-surface-hover'}`}
                    >
                      <td className="px-5 py-3 text-center">
                        <span className="text-sm font-semibold text-ink-muted">#{d.rank}</span>
                      </td>
                      <td
                        className="px-4 py-3 cursor-pointer"
                        onClick={() => router.push(`/matching/${params.requirementId}/decisions/${d.id}`)}
                      >
                        <p className="font-medium text-ink truncate max-w-[240px]">{d.display_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <FitBar score={d.fit_score} isCapped={d.is_fit_capped} />
                      </td>
                      <td className="px-4 py-3">
                        <ConfidencePill band={d.confidence_band} score={d.confidence_score} />
                      </td>
                      <td className="px-4 py-3">
                        <DeviationProfile
                          h={d.deviations_high_weight}
                          m={d.deviations_medium_weight}
                          l={d.deviations_low_weight}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {d.comments_count > 0
                          ? <span className="text-xs text-warning font-medium">{d.comments_count}</span>
                          : <span className="text-xs text-ink-faint">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {isCurrent ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${selection?.mode === 'override' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            <CheckCircle2 className="h-3 w-3" />
                            {selection?.mode === 'auto' ? 'auto' : selection?.mode === 'override' ? 'override' : 'selected'}
                          </span>
                        ) : (
                          <button
                            disabled={!!selecting}
                            onClick={() => handleSelect(d)}
                            className="text-xs text-primary hover:underline disabled:opacity-40"
                          >
                            {selecting === d.canonical_product_id ? 'selecting…' : 'select'}
                          </button>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-ink-faint cursor-pointer"
                        onClick={() => router.push(`/matching/${params.requirementId}/decisions/${d.id}`)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Pending Characterisation ─────────────────────────────────── */}
      {!loading && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Pending Characterisation
            </CardTitle>
            <span className="text-xs text-ink-muted">{pending.length} product{pending.length !== 1 ? 's' : ''} — delivered output not yet assessed</span>
          </CardHeader>
          <ul className="divide-y divide-border/40">
            {pending.map((d) => {
              const isCurrent = isCurrentSelection(d);
              return (
                <li key={d.id} className={`flex items-start gap-3 px-5 py-3 ${isCurrent ? 'bg-amber-50/50' : ''}`}>
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => router.push(`/matching/${params.requirementId}/decisions/${d.id}`)}
                      className="text-sm font-medium text-ink hover:underline text-left"
                    >
                      {d.display_name}
                    </button>
                    <p className="text-xs text-ink-muted mt-0.5">Delivered lumen output pending diffuser characterisation</p>
                  </div>
                  {isCurrent ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">override</span>
                  ) : (
                    <button
                      disabled={!!selecting}
                      onClick={() => handleSelect(d)}
                      className="text-xs text-ink-muted hover:text-warning disabled:opacity-40 shrink-0"
                    >
                      select (override)
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── Disqualified ─────────────────────────────────────────────── */}
      {!loading && disqualified.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-danger" />
              Disqualified — Hard Gate Failed
            </CardTitle>
            <span className="text-xs text-ink-muted">{disqualified.length} product{disqualified.length !== 1 ? 's' : ''}</span>
          </CardHeader>
          <ul className="divide-y divide-border/40">
            {disqualified.map((d) => {
              const isCurrent = isCurrentSelection(d);
              return (
                <li key={d.id} className={isCurrent ? 'bg-amber-50/50' : ''}>
                  <div className="flex w-full items-start gap-3 px-5 py-3">
                    <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => router.push(`/matching/${params.requirementId}/decisions/${d.id}`)}
                        className="text-sm font-medium text-ink hover:underline text-left"
                      >
                        {d.display_name}
                      </button>
                      {d.gate_failures && d.gate_failures.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5">
                          {d.gate_failures.map((f, i) => (
                            <li key={i} className="text-xs text-ink-muted">
                              <span className="font-medium text-danger">{f.attr}</span>
                              {': '}
                              <span className="font-mono">{f.product_value ?? '(missing)'}</span>
                              {' — required '}
                              <span className="font-mono">{f.required}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 shrink-0">override</span>
                    ) : (
                      <button
                        disabled={!!selecting}
                        onClick={() => handleSelect(d)}
                        className="text-xs text-ink-muted hover:text-danger disabled:opacity-40 shrink-0"
                      >
                        select (override)
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── Excluded ─────────────────────────────────────────────────── */}
      {!loading && excluded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MinusCircle className="h-4 w-4 text-ink-faint" />
              Excluded — Type Mismatch
            </CardTitle>
            <span className="text-xs text-ink-muted">{excluded.length} product{excluded.length !== 1 ? 's' : ''}</span>
          </CardHeader>
          <ul className="divide-y divide-border/40">
            {excluded.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <MinusCircle className="h-4 w-4 text-ink-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-muted">{d.display_name}</p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    Product type: <span className="font-mono">{d.luminaire_type ?? 'unclassified'}</span>
                    {requirement && (
                      <> — required: <span className="font-mono">{requirement.luminaire_type}</span></>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
