'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ShieldCheck, ShieldX, ShieldQuestion } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FitNumber } from '@/components/matching/FitBar';
import { ConfidencePill } from '@/components/matching/ConfidencePill';
import { VerdictBadge } from '@/components/matching/VerdictBadge';
import type { MatchDecisionDetail, MatchEvidenceRow } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<string, string> = {
  gte:                   '≥',
  lte:                   '≤',
  eq:                    '=',
  range_covers:          'covers',
  match_target:          'matches',
  match_target_cct:      'CCT ±100K',
  contains_value:        'contains',
  contains_required_cert:'cert includes',
  member_of:             'in',
  colour_family_gate:    'family',
};

const PROVENANCE_LABELS: Record<string, string> = {
  test_report_backed:    'Test report',
  manufacturer_confirmed:'Mfr. confirmed',
  human_confirmed:       'Human confirmed',
  extracted:             'AI extracted',
  missing:               'Missing',
};

function provenanceLabel(p: string | null) {
  if (!p) return '—';
  return PROVENANCE_LABELS[p] ?? p;
}

function requiresConfirm(row: MatchEvidenceRow) {
  return row.provenance === 'extracted';
}

function GateIcon({ verdict }: { verdict: string }) {
  if (verdict === 'gate_pass') return <ShieldCheck className="h-4 w-4 text-success" />;
  if (verdict === 'gate_fail') return <ShieldX className="h-4 w-4 text-danger" />;
  return <ShieldQuestion className="h-4 w-4 text-ink-faint" />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-20 rounded-xl bg-surface-subtle animate-pulse" />
      <div className="h-40 rounded-xl bg-surface-subtle animate-pulse" />
      <div className="h-72 rounded-xl bg-surface-subtle animate-pulse" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DecisionDetailPage({
  params,
}: {
  params: { requirementId: string; decisionId: string };
}) {
  const router = useRouter();
  const { token } = useAuth();
  const [decision, setDecision] = useState<MatchDecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // attribute_key being confirmed

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.matching.getDecision(token, params.decisionId);
      setDecision(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load evidence.');
    } finally {
      setLoading(false);
    }
  }, [token, params.decisionId]);

  useEffect(() => { load(); }, [load]);

  async function handleConfirm(attributeKey: string) {
    if (!token) return;
    setConfirming(attributeKey);
    try {
      const data = await api.matching.confirmAttr(token, params.decisionId, attributeKey);
      setDecision(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Confirm failed.');
    } finally {
      setConfirming(null);
    }
  }

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!decision) return null;

  const gates   = decision.evidence.filter((r) => r.is_gate);
  const scored  = decision.evidence.filter((r) => !r.is_gate);

  const backHref = `/matching/${params.requirementId}`;

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => router.push(backHref)}
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Results
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">{decision.display_name ?? 'Product'}</h1>
            {decision.status === 'excluded' && (
              <p className="mt-0.5 text-sm text-ink-muted">
                Excluded — product type <span className="font-mono text-xs">{decision.luminaire_type ?? 'unclassified'}</span> does not match requirement
              </p>
            )}
            {decision.status === 'disqualified' && (
              <p className="mt-0.5 text-sm text-danger">Disqualified — failed hard gate(s)</p>
            )}
          </div>

          {/* Fit + confidence summary */}
          {decision.status === 'evaluated' && (
            <div className="flex items-center gap-6 rounded-xl border border-border/60 bg-surface-subtle px-5 py-3">
              <div className="text-center">
                <p className="text-xs text-ink-faint mb-0.5">Fit</p>
                <FitNumber score={decision.fit_score} isCapped={decision.is_fit_capped} />
              </div>
              <div className="h-8 w-px bg-border/60" />
              <div className="text-center">
                <p className="text-xs text-ink-faint mb-0.5">Confidence</p>
                <ConfidencePill band={decision.confidence_band} score={decision.confidence_score} />
              </div>
              {decision.rank && (
                <>
                  <div className="h-8 w-px bg-border/60" />
                  <div className="text-center">
                    <p className="text-xs text-ink-faint mb-0.5">Rank</p>
                    <span className="text-sm font-semibold text-ink">#{decision.rank}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Capped warning */}
        {decision.is_fit_capped && decision.fit_cap_reason && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-xs text-warning">
            Fit score is capped: {decision.fit_cap_reason}
          </div>
        )}
      </div>

      {/* ── Gate results ──────────────────────────────────────────────────── */}
      {gates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gate Results</CardTitle>
            <span className="text-xs text-ink-muted">{gates.length} gate{gates.length !== 1 ? 's' : ''} evaluated</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-muted w-8" />
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Attribute</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Required</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Product value</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Verdict</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {gates.map((row) => (
                  <tr key={row.id} className={row.verdict === 'gate_fail' ? 'bg-danger-soft/30' : undefined}>
                    <td className="px-5 py-3">
                      <GateIcon verdict={row.verdict} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-ink">{row.attribute_key}</span>
                      {row.gate_type && (
                        <span className="ml-1.5 text-xs text-ink-faint">({row.gate_type})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-ink-muted">
                        {OPERATOR_LABELS[row.required_operator ?? ''] ?? row.required_operator}
                        {' '}
                        <span className="font-mono text-ink">{row.required_value ?? '—'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-ink">{row.product_value ?? <span className="text-ink-faint">missing</span>}</span>
                    </td>
                    <td className="px-4 py-3">
                      <VerdictBadge verdict={row.verdict} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted max-w-[280px]">
                      {row.evidence_note ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Scored attributes ─────────────────────────────────────────────── */}
      {scored.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attribute Scorecard</CardTitle>
            <span className="text-xs text-ink-muted">{scored.length} attribute{scored.length !== 1 ? 's' : ''}</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-muted">Attribute</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Required</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Actual</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Verdict</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Weight</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Provenance</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-muted">Note</th>
                  <th className="px-4 py-2.5 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {scored.map((row) => {
                  const isConfirming = confirming === row.attribute_key;
                  const canConfirm = requiresConfirm(row);
                  return (
                    <tr
                      key={row.id}
                      className={
                        row.verdict === 'deviation'
                          ? 'bg-danger-soft/20'
                          : row.verdict === 'comment'
                          ? 'bg-warning-soft/20'
                          : undefined
                      }
                    >
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-ink">{row.attribute_key}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        <span className="text-xs text-ink-faint mr-1">
                          {OPERATOR_LABELS[row.required_operator ?? ''] ?? row.required_operator}
                        </span>
                        <span className="font-mono text-ink">{row.required_value ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-ink">{row.product_value ?? <span className="text-ink-faint">missing</span>}</span>
                      </td>
                      <td className="px-4 py-3">
                        <VerdictBadge verdict={row.verdict} />
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-ink-muted">
                        {row.weight != null ? row.weight.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            row.provenance === 'test_report_backed' || row.provenance === 'manufacturer_confirmed'
                              ? 'text-xs text-success'
                              : row.provenance === 'human_confirmed'
                              ? 'text-xs text-primary'
                              : row.provenance === 'extracted'
                              ? 'text-xs text-warning'
                              : row.provenance === 'missing'
                              ? 'text-xs text-danger'
                              : 'text-xs text-ink-faint'
                          }
                        >
                          {provenanceLabel(row.provenance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted max-w-[220px]">
                        {row.evidence_note ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {canConfirm && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={isConfirming}
                            onClick={() => handleConfirm(row.attribute_key)}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Confirm
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Score summary footer */}
          {decision.status === 'evaluated' && (
            <div className="border-t border-border/60 px-5 py-3 flex items-center gap-6 text-xs text-ink-muted">
              <span>
                Fit score: <span className="font-semibold text-ink">{decision.fit_score?.toFixed(1) ?? '—'}%</span>
              </span>
              {decision.deviations_high_weight > 0 && (
                <span className="text-danger font-medium">{decision.deviations_high_weight} high-weight deviation{decision.deviations_high_weight !== 1 ? 's' : ''}</span>
              )}
              {decision.deviations_medium_weight > 0 && (
                <span className="text-warning font-medium">{decision.deviations_medium_weight} medium-weight deviation{decision.deviations_medium_weight !== 1 ? 's' : ''}</span>
              )}
              {decision.comments_count > 0 && (
                <span>{decision.comments_count} comment{decision.comments_count !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {gates.length === 0 && scored.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-ink-muted">No evidence rows found. Re-run matching to generate evidence.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
