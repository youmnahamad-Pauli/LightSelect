'use client';

import { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useExtractionJobs } from '@/hooks/use-extraction';
import { formatDate } from '@/lib/utils';
import type {
  MappedProjectFile,
  ProductAttribute,
  ExtractionJob,
  AttributeValueSource,
} from '@/types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function jobStatusVariant(status: ExtractionJob['status']) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'failed':    return 'danger' as const;
    case 'processing':
    case 'queued':    return 'info' as const;
    default:          return 'neutral' as const;
  }
}

function avgConfidence(job: ExtractionJob): number | null {
  if (!job.raw_output || typeof job.raw_output !== 'object') return null;
  const fields = (job.raw_output as any).fields;
  if (!fields || typeof fields !== 'object') return null;
  const values = Object.values(fields) as any[];
  if (!values.length) return null;
  const avg = values.reduce((s, v) => s + (v?.confidence ?? 0), 0) / values.length;
  return Math.round(avg * 100);
}

// ─── Job history row ───────────────────────────────────────────────────────

function JobRow({ job }: { job: ExtractionJob }) {
  const [expanded, setExpanded] = useState(false);
  const avgPct = avgConfidence(job);

  return (
    <div className="border border-slate-100 rounded-md overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
          <Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge>
          {job.extracted_count != null && (
            <span className="text-xs text-slate-500">{job.extracted_count} attributes</span>
          )}
          {avgPct != null && (
            <span className="text-xs text-slate-500">avg {avgPct}% confidence</span>
          )}
        </div>
        <span className="text-xs text-slate-400">{formatDate(job.created_at)}</span>
      </button>

      {expanded && job.status === 'failed' && job.error_message && (
        <div className="px-3 py-2 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">{job.error_message}</p>
        </div>
      )}

      {expanded && job.status === 'completed' && job.raw_output && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-1 font-medium">
            Extracted {(job.raw_output as any)?.total_pages} page(s) in{' '}
            {(job.raw_output as any)?.extraction_time_ms} ms
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ExtractionPanel ───────────────────────────────────────────────────────

interface ExtractionPanelProps {
  productId: string;
  /** Mapped project files already linked to this product — these are extraction candidates. */
  linkedProjectFiles: MappedProjectFile[];
  currentAttributes: ProductAttribute[];
  /** Called after extraction completes with the updated attributes. */
  onExtracted: (attributes: ProductAttribute[]) => void;
}

export function ExtractionPanel({
  productId,
  linkedProjectFiles,
  currentAttributes,
  onExtracted,
}: ExtractionPanelProps) {
  const { token } = useAuth();

  // Only show PDF-like files as extraction candidates
  const pdfFiles = linkedProjectFiles.filter(
    (pf) => !pf.mime_type || pf.mime_type.includes('pdf') || pf.mime_type.includes('image'),
  );

  const [selectedFileId, setSelectedFileId] = useState<string>(pdfFiles[0]?.id ?? '');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [lastResult, setLastResult] = useState<{ count: number; avgPct: number } | null>(null);

  const { jobs, addJob } = useExtractionJobs(selectedFileId || null);

  const extractedCount = currentAttributes.filter((a) => a.value_source === 'extracted').length;
  const hasExtracted = extractedCount > 0;

  async function handleExtract() {
    if (!token || !selectedFileId) return;
    setExtracting(true);
    setExtractError('');
    setLastResult(null);
    try {
      const result = await api.extraction.run(token, selectedFileId);
      addJob(result.job);
      onExtracted(result.attributes);

      const pct = avgConfidence(result.job);
      setLastResult({
        count: result.job.extracted_count ?? result.attributes.filter((a) => a.value_source === 'extracted').length,
        avgPct: pct ?? 0,
      });
    } catch (err) {
      setExtractError(err instanceof ApiError ? err.message : 'Extraction failed. Please try again.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleAcceptAll() {
    if (!token) return;
    const extractedAttrs = currentAttributes.filter((a) => a.value_source === 'extracted');
    if (extractedAttrs.length === 0) return;

    try {
      const saved = await api.products.saveAttributes(token, productId, {
        attributes: extractedAttrs.map((a) => ({
          attribute_name: a.attribute_name,
          attribute_value: a.attribute_value,
          value_source: 'manual' as AttributeValueSource,
          confidence_score: null,
        })),
      });
      onExtracted(saved);
    } catch (err) {
      setExtractError(err instanceof ApiError ? err.message : 'Failed to accept attributes.');
    }
  }

  if (pdfFiles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-500" />
            <CardTitle>Extract from PDF</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            No PDF or image files are linked to this product. Link a manufacturer datasheet from the
            <strong> Linked Files</strong> section above to enable attribute extraction.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-500" />
          <CardTitle>Extract from PDF</CardTitle>
        </div>
        <p className="text-xs text-slate-500">
          Automatically extract attribute values from a linked manufacturer PDF.
          Review each extracted value in the attributes table above before finalising.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {extractError && (
          <Alert variant="error" onDismiss={() => setExtractError('')}>
            {extractError}
          </Alert>
        )}

        {lastResult && (
          <Alert variant="success">
            Extracted <strong>{lastResult.count} attributes</strong> with{' '}
            <strong>{lastResult.avgPct}% average confidence</strong>. Review them in the
            attributes table above — they appear in blue.
          </Alert>
        )}

        {/* File selector + actions */}
        <div className="flex flex-wrap items-center gap-3">
          {pdfFiles.length > 1 && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {pdfFiles.map((pf) => (
                  <option key={pf.id} value={pf.id}>
                    {pf.file_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {pdfFiles.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="truncate max-w-xs">{pdfFiles[0].file_name}</span>
            </div>
          )}

          <Button
            size="sm"
            onClick={handleExtract}
            loading={extracting}
            disabled={!selectedFileId}
          >
            {extracting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {hasExtracted ? 'Re-extract' : 'Extract Attributes'}
              </>
            )}
          </Button>

          {hasExtracted && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAcceptAll}
              title="Convert all extracted values to manual (confirms they have been reviewed)"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Accept All Extracted ({extractedCount})
            </Button>
          )}
        </div>

        {hasExtracted && !lastResult && (
          <p className="text-xs text-slate-400">
            {extractedCount} extracted attribute{extractedCount !== 1 ? 's' : ''} pending review
            in the attributes table above.{' '}
            <em>Accept All</em> to confirm them as manually-reviewed values.
          </p>
        )}

        {/* Extraction history */}
        {jobs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Extraction History
            </p>
            {jobs.slice(0, 5).map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
