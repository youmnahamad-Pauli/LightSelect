'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  FileText,
  ArrowRight,
  RefreshCw,
  Download,
  Package,
  Eye,
} from 'lucide-react';
import { useSubmittalCompleteness } from '@/hooks/use-submittal-completeness';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn } from '@/lib/utils';
import type { SubmittalProjectScopeItem, SubmittalRequirementRow, PackageManifest, PackageManifestItem } from '@/types';

// ─── Item row ──────────────────────────────────────────────────────────────

function ItemRow({
  label,
  required,
  satisfied,
  isComplianceStatement = false,
  docCount,
  note,
}: {
  label: string;
  required: boolean;
  satisfied: boolean;
  isComplianceStatement?: boolean;
  docCount?: number;
  note?: string | null;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        satisfied
          ? 'border-success/10 bg-success-soft/20'
          : required
          ? 'border-danger/15 bg-danger-soft/20'
          : 'border-warning/15 bg-warning-soft/20',
      )}
    >
      {satisfied ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle
          className={cn('mt-0.5 h-4 w-4 shrink-0', required ? 'text-danger' : 'text-warning')}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{label}</span>
          <Badge variant={required ? 'danger' : 'neutral'}>
            {required ? 'Required' : 'Optional'}
          </Badge>
          {isComplianceStatement && (
            <Badge variant="neutral">Auto — matching engine</Badge>
          )}
        </div>
        {note && <p className="mt-0.5 text-xs text-ink-muted">{note}</p>}
        {!isComplianceStatement && docCount !== undefined && (
          <p className="mt-0.5 text-xs text-ink-muted">
            {docCount} doc{docCount !== 1 ? 's' : ''} linked
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Project-scope section ─────────────────────────────────────────────────

function ProjectScopeSection({
  items,
  projectId,
}: {
  items: SubmittalProjectScopeItem[];
  projectId: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project-Level Documents</CardTitle>
        <p className="text-xs text-ink-faint">
          One document per submittal package.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <ItemRow
            key={item.template_item_id}
            label={item.label}
            required={item.required}
            satisfied={item.satisfied}
            docCount={item.doc_count}
            note={
              !item.satisfied && item.required
                ? 'Upload and classify as this document type in the Documents tab.'
                : null
            }
          />
        ))}
        {items.some((i) => i.required && !i.satisfied) && (
          <div className="pt-1">
            <Link href={`/projects/${projectId}/documents`}>
              <Button size="sm" variant="secondary">
                Go to Documents
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Per-item section ──────────────────────────────────────────────────────

function PerItemSection({
  rows,
  projectId,
}: {
  rows: SubmittalRequirementRow[];
  projectId: string;
}) {
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Luminaire Documents</CardTitle>
        <p className="text-xs text-ink-faint">
          Required per schedule item. Compliance statements are auto-satisfied when a product is
          selected in the matching engine.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.requirement_id}>
            <div className="mb-1.5 flex items-center gap-2">
              {row.all_required_satisfied ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <XCircle className="h-4 w-4 text-danger" />
              )}
              <span className="text-sm font-semibold text-ink">
                {row.item_code ? `${row.item_code} — ` : ''}{row.requirement_name}
              </span>
              <span className="text-xs text-ink-faint">{row.luminaire_type}</span>
            </div>
            <div className="ml-6 space-y-1.5">
              {row.items.map((item) => (
                <ItemRow
                  key={item.template_item_id}
                  label={item.label}
                  required={item.required}
                  satisfied={item.satisfied}
                  isComplianceStatement={item.is_compliance_statement}
                  docCount={item.is_compliance_statement ? undefined : item.doc_count}
                  note={
                    item.is_compliance_statement && !item.satisfied
                      ? 'Select a product in the Luminaire Schedule to satisfy this automatically.'
                      : !item.satisfied && item.required && !item.is_compliance_statement
                      ? 'Upload in Documents tab, then link to this schedule item.'
                      : null
                  }
                />
              ))}
            </div>
          </div>
        ))}
        {rows.some((r) => !r.all_required_satisfied) && (
          <div className="flex gap-2 pt-1">
            <Link href={`/projects/${projectId}/documents`}>
              <Button size="sm" variant="secondary">
                Upload documents
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/schedule`}>
              <Button size="sm" variant="secondary">
                View luminaire schedule
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Package manifest row ──────────────────────────────────────────────────

function ManifestRow({ item }: { item: PackageManifestItem }) {
  const statusBg =
    item.status === 'present' || item.status === 'generated'
      ? 'border-success/15 bg-success-soft/10'
      : item.status === 'missing_overridden'
      ? 'border-warning/20 bg-warning-soft/20'
      : 'border-danger/15 bg-danger-soft/10';
  const statusIcon =
    item.status === 'present' || item.status === 'generated' ? (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success mt-0.5" />
    ) : item.status === 'missing_overridden' ? (
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" />
    ) : (
      <XCircle className="h-3.5 w-3.5 shrink-0 text-danger mt-0.5" />
    );

  const location = item.in_pdf
    ? <span className="text-xs text-ink-faint">In PDF</span>
    : item.in_zip
    ? <span className="text-xs text-warning">ZIP: {item.filename}</span>
    : <span className="text-xs text-ink-faint">—</span>;

  return (
    <div className={cn('flex items-start gap-2 rounded border px-3 py-2', statusBg)}>
      {statusIcon}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink">{item.label}</span>
          {(item.item_code ?? item.requirement_name) && (
            <span className="text-xs text-ink-faint">
              {item.item_code ?? item.requirement_name}
            </span>
          )}
          {location}
        </div>
        {item.note && (
          <p className="mt-0.5 text-xs text-ink-muted italic">{item.note}</p>
        )}
      </div>
    </div>
  );
}

// ─── Download helper ───────────────────────────────────────────────────────

function triggerDownload(base64: string, filename: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob  = new Blob([bytes], { type: mimeType });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SubmittalPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const { completeness, loading, error, reload } = useSubmittalCompleteness(params.id);
  const [gateChecking, setGateChecking] = useState(false);
  const [gateResult, setGateResult] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Package assembly state
  const [manifest, setManifest] = useState<PackageManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genOverrideMode, setGenOverrideMode] = useState(false);
  const [genOverrideReason, setGenOverrideReason] = useState('');

  const handlePreviewManifest = useCallback(async () => {
    if (!token) return;
    setManifestLoading(true);
    setManifestError(null);
    try {
      const m = await api.submittalPackage.manifest(token, params.id);
      setManifest(m);
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : 'Failed to load manifest.');
    } finally {
      setManifestLoading(false);
    }
  }, [token, params.id]);

  const handleGenerate = useCallback(async (withOverride = false) => {
    if (!token) return;
    setGenerating(true);
    setGenError(null);
    try {
      const result = await api.submittalPackage.generate(token, params.id, {
        is_override:     withOverride,
        override_reason: withOverride && genOverrideReason ? genOverrideReason : undefined,
      });
      setManifest(result.manifest);
      setGenOverrideMode(false);
      setGenOverrideReason('');
      // Trigger PDF download
      triggerDownload(result.pdf_base64, result.pdf_filename, 'application/pdf');
      // Trigger ZIP download if present
      if (result.zip_base64 && result.zip_filename) {
        triggerDownload(result.zip_base64, result.zip_filename, 'application/zip');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setGenError(err.message);
        setGenOverrideMode(true);
      } else {
        setGenError(err instanceof Error ? err.message : 'Package generation failed.');
      }
    } finally {
      setGenerating(false);
    }
  }, [token, params.id, genOverrideReason]);

  async function handleGateCheck(withOverride = false) {
    if (!token) return;
    setGateChecking(true);
    setGateResult(null);
    setGateError(null);
    try {
      const result = await api.submittalCompleteness.check(token, params.id, {
        is_override: withOverride,
        override_reason: withOverride && overrideReason ? overrideReason : undefined,
      });
      if (result.override_applied) {
        setGateResult(`Override logged. ${result.missing_items.length} item(s) missing — proceeding with override.`);
        setOverrideMode(false);
        setOverrideReason('');
      } else {
        setGateResult('Submittal is complete and export-ready.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setGateError(err.message);
        setOverrideMode(true);
      } else {
        setGateError(err instanceof Error ? err.message : 'Gate check failed.');
      }
    } finally {
      setGateChecking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !completeness) {
    return <Alert variant="error">{error ?? 'Failed to load submittal completeness.'}</Alert>;
  }

  const { summary } = completeness;
  const totalRequired = summary.project_scope_total + summary.per_item_total;
  const totalSatisfied = summary.project_scope_satisfied + summary.per_item_satisfied;
  const progressPct = totalRequired === 0 ? 100 : Math.round((totalSatisfied / totalRequired) * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-faint">
          Track and complete the document checklist required for your submittal package. Compliance
          statements are auto-populated by the matching engine.
        </p>
        <Button variant="ghost" size="sm" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* No-template notice */}
      {completeness.no_template && (
        <Alert variant="warning">
          <strong>No submittal template assigned.</strong> Assign a template on the project to
          compute submittal completeness.{' '}
          <Link href={`/projects/${params.id}/overview`} className="underline font-medium">
            Edit project
          </Link>
        </Alert>
      )}

      {/* Completeness banner */}
      {!completeness.no_template && (
        <>
          {completeness.is_export_ready ? (
            <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-soft/40 px-5 py-4">
              <ShieldCheck className="h-6 w-6 text-success shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-success">Submittal complete</p>
                <p className="text-sm text-success/70 mt-0.5">
                  All {totalRequired} required items satisfied.
                  {summary.override_count > 0 && ` ${summary.override_count} override(s) recorded.`}
                  {summary.stub_count > 0 && ` ${summary.stub_count} item(s) have no compliant candidate.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-blocked/25 bg-blocked-soft/40 px-5 py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-blocked shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-blocked">Submittal incomplete</p>
                  <p className="text-sm text-blocked/80 mt-0.5">
                    {summary.blocking_missing} required item{summary.blocking_missing !== 1 ? 's' : ''}{' '}
                    still missing. Resolve before export.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <Card>
            <CardContent className="py-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {completeness.template_name ?? 'Submittal Template'}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {totalSatisfied} of {totalRequired} required satisfied
                    {summary.override_count > 0 && ` · ${summary.override_count} overridden`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-ink-faint" />
                </div>
              </div>
              <ProgressBar
                value={progressPct}
                size="md"
                variant={completeness.is_export_ready ? 'success' : 'default'}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Project-scope items */}
      <ProjectScopeSection
        items={completeness.project_scope_items}
        projectId={params.id}
      />

      {/* Per-item rows */}
      <PerItemSection
        rows={completeness.per_item_rows}
        projectId={params.id}
      />

      {/* Export gate */}
      {!completeness.no_template && (
        <Card>
          <CardHeader>
            <CardTitle>Export Gate</CardTitle>
            <p className="text-xs text-ink-faint">
              Check whether this submittal is ready for export. An explicit override can be
              logged when items are still missing.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {gateResult && (
              <Alert variant="success" onDismiss={() => setGateResult(null)}>
                {gateResult}
              </Alert>
            )}
            {gateError && (
              <Alert variant="error" onDismiss={() => { setGateError(null); setOverrideMode(false); }}>
                {gateError}
              </Alert>
            )}
            {overrideMode && (
              <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft/30 px-4 py-3">
                <p className="text-sm font-medium text-warning">Override required</p>
                <p className="text-xs text-ink-muted">
                  Some required items are missing. Provide a reason to proceed with override (this
                  is logged for audit).
                </p>
                <input
                  type="text"
                  placeholder="Override reason (e.g. supplier lead-time, pending certification)"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleGateCheck(true)}
                    loading={gateChecking}
                    disabled={!overrideReason.trim()}
                  >
                    Confirm override
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setOverrideMode(false); setGateError(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {!overrideMode && (
              <Button
                size="sm"
                onClick={() => handleGateCheck(false)}
                loading={gateChecking}
              >
                Check export readiness
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Package assembly */}
      {!completeness.no_template && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Package className="h-4 w-4 text-brand" />
              Generate Submittal Package
            </CardTitle>
            <p className="text-xs text-ink-faint">
              Assembles all documents into one ordered PDF (index + compliance statements + linked
              uploads). Non-PDF attachments are bundled in a companion ZIP.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Manifest preview */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePreviewManifest}
                loading={manifestLoading}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview manifest
              </Button>
            </div>

            {manifestError && (
              <Alert variant="error" onDismiss={() => setManifestError(null)}>
                {manifestError}
              </Alert>
            )}

            {manifest && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-medium text-ink">
                    {manifest.template_name} · {manifest.items.length} components
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      manifest.gate_state === 'ready'
                        ? 'bg-success/10 text-success'
                        : manifest.gate_state === 'override_applied'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger',
                    )}
                  >
                    {manifest.gate_state === 'ready'
                      ? 'Ready'
                      : manifest.gate_state === 'override_applied'
                      ? 'Override applied'
                      : 'Blocked'}
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                  {manifest.items.map((item, idx) => (
                    <ManifestRow key={`${item.template_item_id}-${item.requirement_id ?? idx}`} item={item} />
                  ))}
                </div>
                <p className="text-xs text-ink-faint">
                  {manifest.pdf_component_count} PDF component{manifest.pdf_component_count !== 1 ? 's' : ''} · {manifest.zip_component_count} ZIP attachment{manifest.zip_component_count !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Generation errors + override */}
            {genError && (
              <Alert variant="error" onDismiss={() => { setGenError(null); setGenOverrideMode(false); }}>
                {genError}
              </Alert>
            )}

            {genOverrideMode && (
              <div className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft/30 px-4 py-3">
                <p className="text-sm font-medium text-warning">Override required to generate</p>
                <p className="text-xs text-ink-muted">
                  The submittal has missing required items. Provide a reason to generate the
                  package with override (logged for audit).
                </p>
                <input
                  type="text"
                  placeholder="Override reason (e.g. supplier lead-time, pending certification)"
                  value={genOverrideReason}
                  onChange={(e) => setGenOverrideReason(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleGenerate(true)}
                    loading={generating}
                    disabled={!genOverrideReason.trim()}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Generate with override
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setGenOverrideMode(false); setGenError(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!genOverrideMode && (
              <Button
                size="sm"
                onClick={() => handleGenerate(false)}
                loading={generating}
              >
                <Download className="h-3.5 w-3.5" />
                Generate package
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
