'use client';

import { Download, CheckCircle2, XCircle, Loader2, Package, FileSpreadsheet, FileText, Archive } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ExportPackage, ExportPackageStatus, ExportPackageArtifact } from '@/types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusVariant(s: ExportPackageStatus) {
  if (s === 'generated') return 'success' as const;
  if (s === 'failed')    return 'danger' as const;
  return 'neutral' as const;
}

function StatusIcon({ status }: { status: ExportPackageStatus }) {
  if (status === 'generated') return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === 'failed')    return <XCircle className="h-4 w-4 text-danger" />;
  return <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />;
}

function ArtifactIcon({ type }: { type: string }) {
  if (type === 'pdf') return <FileText className="h-3.5 w-3.5" />;
  if (type === 'zip') return <Archive className="h-3.5 w-3.5" />;
  return <FileSpreadsheet className="h-3.5 w-3.5" />;
}

function artifactLabel(type: string): string {
  if (type === 'pdf') return 'PDF';
  if (type === 'zip') return 'Bundle';
  return type.toUpperCase();
}

// ─── Artifact download button ─────────────────────────────────────────────

interface ArtifactDownloadBtnProps {
  pkg: ExportPackage;
  artifact: ExportPackageArtifact;
  token: string;
}

function ArtifactDownloadBtn({ pkg, artifact, token }: ArtifactDownloadBtnProps) {
  const isAvailable = artifact.error_message == null;

  async function handleClick() {
    if (!isAvailable) return;
    const url = api.exports.artifactDownloadUrl(pkg.id, artifact.id!);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const contentDisposition = res.headers.get('content-disposition') ?? '';
      const match = contentDisposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `${artifact.label.toLowerCase().replace(/ /g, '-')}.${artifact.artifact_type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert('Download failed. Please try again.');
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!isAvailable}
      title={isAvailable ? `Download ${artifact.label}` : (artifact.error_message ?? `${artifact.label} failed to generate`)}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
        isAvailable
          ? artifact.artifact_type === 'pdf'
            ? 'text-info border border-info/20 hover:bg-info-soft'
            : artifact.artifact_type === 'zip'
              ? 'text-ink-muted border border-border hover:bg-surface-hover'
              : 'text-primary border border-primary/20 hover:bg-primary-soft'
          : 'text-ink-faint border border-border cursor-not-allowed opacity-50',
      )}
    >
      <ArtifactIcon type={artifact.artifact_type} />
      {artifactLabel(artifact.artifact_type)}
    </button>
  );
}

// ─── Primary download (backward compat) ───────────────────────────────────

async function downloadPrimary(pkg: ExportPackage, token: string) {
  const url = api.exports.downloadUrl(pkg.id);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const contentDisposition = res.headers.get('content-disposition') ?? '';
    const match = contentDisposition.match(/filename="([^"]+)"/);
    a.download = match?.[1] ?? `export-${pkg.id}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    alert('Download failed. Please try again.');
  }
}

// ─── ExportHistory ────────────────────────────────────────────────────────

interface ExportHistoryProps {
  exports: ExportPackage[];
  loading: boolean;
}

export function ExportHistory({ exports, loading }: ExportHistoryProps) {
  const { token } = useAuth();

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (exports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="rounded-xl bg-surface-subtle p-4 text-ink-faint">
          <Package className="h-8 w-8" />
        </div>
        <p className="text-sm font-medium text-ink">No exports yet</p>
        <p className="text-xs text-ink-faint max-w-xs">
          Generate your first export package above once all required sections are complete.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide">Generated</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide w-24">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide">Sections</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-faint uppercase tracking-wide">BOQ</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-ink-faint uppercase tracking-wide">Downloads</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {exports.map((pkg) => {
            const cl = pkg.snapshot_checklist_summary;
            const bq = pkg.snapshot_boq_summary;

            // Decide what download buttons to show
            const artifacts = pkg.artifacts ?? [];
            const hasArtifacts = artifacts.length > 0;

            return (
              <tr key={pkg.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{formatDate(pkg.created_at)}</p>
                  {pkg.error_message && (
                    <p className="text-xs text-danger truncate max-w-xs">{pkg.error_message}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={pkg.status} />
                    <Badge variant={statusVariant(pkg.status)}>{pkg.status}</Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-muted text-xs">
                  {cl ? `${cl.complete_count}/${cl.total_required} complete` : '—'}
                </td>
                <td className="px-4 py-3 text-ink-muted text-xs">
                  {bq
                    ? `${bq.total_items} items${bq.total_price != null ? ` · ${bq.currency} ${bq.total_price.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : ''}`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {pkg.status === 'generated' && (
                    <div className="flex items-center justify-end gap-1.5">
                      {hasArtifacts ? (
                        /* New: render individual artifact download buttons */
                        artifacts.map((art) => (
                          <ArtifactDownloadBtn
                            key={art.id}
                            pkg={pkg}
                            artifact={art}
                            token={token!}
                          />
                        ))
                      ) : (
                        /* Fallback for old exports that predate the artifacts table */
                        <button
                          onClick={() => token && downloadPrimary(pkg, token)}
                          className="inline-flex items-center gap-1 rounded-lg border border-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft transition-colors"
                          title="Download export"
                        >
                          <Download className="h-3.5 w-3.5" />
                          XLSX
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
