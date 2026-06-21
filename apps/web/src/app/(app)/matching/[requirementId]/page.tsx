'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, ChevronRight, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FitBar } from '@/components/matching/FitBar';
import { ConfidencePill } from '@/components/matching/ConfidencePill';
import type { MatchingRequirement, MatchDecisionSummary } from '@/types';

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

export default function RequirementResultsPage({ params }: { params: { requirementId: string } }) {
  const router = useRouter();
  const { token, organization } = useAuth();
  const [requirement, setRequirement] = useState<MatchingRequirement | null>(null);
  const [decisions, setDecisions] = useState<MatchDecisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Load the requirement detail from the requirements list
      const reqData = await api.matching.listRequirements(token, organization.id);
      const req = reqData.requirements.find((r) => r.id === params.requirementId) ?? null;
      setRequirement(req);

      const decData = await api.matching.listDecisions(token, params.requirementId);
      setDecisions(decData.decisions);
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
      // silently retry; load will show any error
    } finally {
      setRerunning(false);
    }
  }

  const ranked      = decisions.filter((d) => d.status === 'evaluated').sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const disqualified = decisions.filter((d) => d.status === 'disqualified');
  const excluded    = decisions.filter((d) => d.status === 'excluded');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push('/matching')}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All requirements
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
        <Button variant="secondary" size="sm" loading={rerunning} onClick={handleRerun}>
          <RefreshCw className="h-3.5 w-3.5" />
          Re-run
        </Button>
      </div>

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
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted w-8">
                    {/* Adjustments placeholder — reserved column */}
                  </th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {ranked.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/matching/${params.requirementId}/decisions/${d.id}`)}
                    className="cursor-pointer transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-5 py-3 text-center">
                      <span className="text-sm font-semibold text-ink-muted">#{d.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink truncate max-w-[260px]">{d.display_name}</p>
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
                    {/* Adjustments slot: reserved, currently empty */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-ink-faint/40 italic select-none">adj</span>
                    </td>
                    <td className="px-4 py-3 text-ink-faint">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
            {disqualified.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => router.push(`/matching/${params.requirementId}/decisions/${d.id}`)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
                >
                  <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{d.display_name}</p>
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
                  <ChevronRight className="h-4 w-4 text-ink-faint shrink-0 mt-0.5" />
                </button>
              </li>
            ))}
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
