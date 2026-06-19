'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Sparkles, Zap, GitCompare, Pencil, CheckCircle2 } from 'lucide-react';
import { useSpecDocument } from '@/hooks/use-spec';
import { useProducts } from '@/hooks/use-products';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { RequirementsEditor } from '@/components/spec/RequirementsEditor';
import { SpecDiffView } from '@/components/spec/SpecDiffView';
import { ComplianceView } from '@/components/spec/ComplianceView';
import { formatDate } from '@/lib/utils';
import type { SpecRequirement, SpecComparisonDetail, DiffSummary } from '@/types';

export default function SpecDetailPage({
  params,
}: {
  params: { id: string; specId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const diffTargetId = searchParams.get('diff');
  const { token } = useAuth();

  const { document, setDocument, loading, error, reload } = useSpecDocument(params.specId);
  const { products } = useProducts(params.id);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractInfo, setExtractInfo] = useState('');

  const [diffResult, setDiffResult] = useState<{ summary: DiffSummary; fromLabel: string; toLabel: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareTargetId, setCompareTargetId] = useState('');
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [complianceDetail, setComplianceDetail] = useState<SpecComparisonDetail | null>(null);

  // Auto-load diff if ?diff= is in URL
  useEffect(() => {
    if (!diffTargetId || !token || !document) return;
    setDiffLoading(true);
    api.spec.diffDocuments(token, params.specId, diffTargetId)
      .then(({ summary }) => {
        setDiffResult({ summary, fromLabel: document.version_label, toLabel: diffTargetId });
      })
      .catch(() => {})
      .finally(() => setDiffLoading(false));
  }, [diffTargetId, token, params.specId, document]);

  async function handleExtract() {
    if (!token) return;
    setExtracting(true);
    setExtractError('');
    setExtractInfo('');
    try {
      const result = await api.spec.extractRequirements(token, params.specId);
      setExtractInfo(`Extracted ${result.extracted_count} requirements.`);
      await reload();
    } catch (err) {
      setExtractError(err instanceof ApiError ? err.message : 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSetActive() {
    if (!token) return;
    try {
      await api.spec.setActive(token, params.specId);
      await reload();
    } catch {}
  }

  async function handleRunComparison() {
    if (!token || !compareTargetId) { setCompareError('Select a product.'); return; }
    setComparing(true);
    setCompareError('');
    try {
      const detail = await api.spec.runComparison(token, {
        spec_document_id: params.specId,
        target_type: 'product',
        target_id: compareTargetId,
      });
      setComplianceDetail(detail);
      setCompareOpen(false);
    } catch (err) {
      setCompareError(err instanceof ApiError ? err.message : 'Comparison failed.');
    } finally {
      setComparing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <Alert variant="error">
        {error ?? 'Spec document not found.'}{' '}
        <Link href={`/projects/${params.id}/spec`} className="underline">Back to spec.</Link>
      </Alert>
    );
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: [p.manufacturer, p.model_number].filter(Boolean).join(' — ') || 'Unnamed product',
  }));

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link
        href={`/projects/${params.id}/spec`}
        className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Spec Versions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{document.title}</h1>
            <Badge variant="neutral">{document.version_label}</Badge>
            {document.is_active && <Badge variant="success">Active</Badge>}
          </div>
          {document.file_name && (
            <p className="mt-0.5 text-xs text-ink-faint">{document.file_name}</p>
          )}
          <p className="text-xs text-ink-faint mt-0.5">Uploaded {formatDate(document.created_at)}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!document.is_active && (
            <Button variant="secondary" size="sm" onClick={handleSetActive}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Set active
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleExtract} loading={extracting}>
            <Sparkles className="h-3.5 w-3.5" />
            {document.requirements.length > 0 ? 'Re-extract' : 'Extract Requirements'}
          </Button>
          <Button size="sm" onClick={() => setCompareOpen(true)}>
            <Zap className="h-3.5 w-3.5" />
            Run Comparison
          </Button>
        </div>
      </div>

      {extractError && <Alert variant="error" onDismiss={() => setExtractError('')}>{extractError}</Alert>}
      {extractInfo && <Alert variant="success" onDismiss={() => setExtractInfo('')}>{extractInfo}</Alert>}

      {/* Requirements editor */}
      <Card>
        <CardHeader>
          <CardTitle>
            Requirements
            {document.requirements.length > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-faint">
                {document.requirements.length} requirement{document.requirements.length !== 1 ? 's' : ''}
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-ink-faint">
            Review and edit extracted requirements. Mark as Reviewed after confirming each value.
          </p>
        </CardHeader>
        <CardContent>
          <RequirementsEditor
            specDocumentId={params.specId}
            requirements={document.requirements}
            onUpdated={(reqs) => setDocument({ ...document, requirements: reqs })}
          />
        </CardContent>
      </Card>

      {/* Diff view */}
      {diffResult && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Diff: {diffResult.fromLabel} → {diffResult.toLabel}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SpecDiffView
              diff={diffResult.summary}
              fromLabel={diffResult.fromLabel}
              toLabel={diffResult.toLabel}
            />
          </CardContent>
        </Card>
      )}

      {/* Compliance results */}
      {complianceDetail && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance Results — {complianceDetail.run.target_label}</CardTitle>
            <p className="text-xs text-ink-faint">
              Compared {complianceDetail.results.length} requirements ·{' '}
              {formatDate(complianceDetail.run.compared_at)}
            </p>
          </CardHeader>
          <CardContent>
            <ComplianceView
              run={complianceDetail.run}
              results={complianceDetail.results}
            />
          </CardContent>
        </Card>
      )}

      {/* Run comparison modal */}
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Run Spec Comparison"
        description="Compare spec requirements against a product's extracted attributes."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompareOpen(false)} disabled={comparing}>Cancel</Button>
            <Button onClick={handleRunComparison} loading={comparing}>
              <Zap className="h-3.5 w-3.5" />
              Run
            </Button>
          </>
        }
      >
        {compareError && <Alert variant="error" className="mb-3">{compareError}</Alert>}
        {document.requirements.length === 0 && (
          <Alert variant="warning" className="mb-3">
            This spec version has no requirements. Extract requirements first.
          </Alert>
        )}
        <FormField label="Product to compare" htmlFor="cmp_prod">
          <Select
            id="cmp_prod"
            options={productOptions}
            placeholder={products.length === 0 ? 'No products yet' : 'Select a product…'}
            value={compareTargetId}
            onChange={(e) => setCompareTargetId(e.target.value)}
            disabled={products.length === 0}
          />
        </FormField>
      </Modal>
    </div>
  );
}
