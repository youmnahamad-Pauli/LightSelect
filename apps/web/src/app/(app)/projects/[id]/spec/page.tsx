'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Zap } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useSpecDocuments, useSpecComparisons } from '@/hooks/use-spec';
import { useProducts } from '@/hooks/use-products';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SpecVersionCard } from '@/components/spec/SpecVersionCard';
import { formatDate } from '@/lib/utils';
import type { SpecDocument, SpecComparisonDetail, ComparisonTargetType } from '@/types';

// ─── New spec document modal ───────────────────────────────────────────────

interface NewSpecModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onCreated: () => void;
}

function NewSpecModal({ open, onClose, projectId, onCreated }: NewSpecModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [version_label, setVersionLabel] = useState('Rev 1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!title.trim() || !version_label.trim()) {
      setError('Title and version are required.');
      return;
    }
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await api.spec.createDocument(token, projectId, {
        title: title.trim(),
        version_label: version_label.trim(),
        notes: notes.trim() || null,
      });
      onCreated();
      onClose();
      setTitle('');
      setVersionLabel('Rev 1');
      setNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create spec document.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Spec Version"
      description="Create a new project specification version. Extract requirements after creation."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Create Version</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        <FormField label="Document Title" htmlFor="spec_title" required>
          <Input id="spec_title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lighting Specification IFT" autoFocus />
        </FormField>
        <FormField label="Version Label" htmlFor="spec_ver" required>
          <Input id="spec_ver" value={version_label} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. Rev 1, IFT, IFC" />
        </FormField>
        <FormField label="Notes" htmlFor="spec_notes">
          <Input id="spec_notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes about this version" />
        </FormField>
      </div>
    </Modal>
  );
}

// ─── Run comparison modal ──────────────────────────────────────────────────

interface RunComparisonModalProps {
  open: boolean;
  onClose: () => void;
  specDocId: string;
  projectId: string;
  onComplete: (detail: SpecComparisonDetail) => void;
}

function RunComparisonModal({ open, onClose, specDocId, projectId, onComplete }: RunComparisonModalProps) {
  const { token } = useAuth();
  const { products } = useProducts(projectId);
  const [targetId, setTargetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (!token || !targetId) { setError('Select a product to compare.'); return; }
    setLoading(true);
    setError('');
    try {
      const detail = await api.spec.runComparison(token, {
        spec_document_id: specDocId,
        target_type: 'product',
        target_id: targetId,
      });
      onComplete(detail);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: [p.manufacturer, p.model_number, p.family_name].filter(Boolean).join(' — ') || 'Unnamed product',
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run Spec Comparison"
      description="Compare the spec requirements against a product's extracted attributes."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={run} loading={loading}><Zap className="h-3.5 w-3.5" />Run Comparison</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <FormField label="Select Product" htmlFor="cmp_product" required>
        <Select
          id="cmp_product"
          options={productOptions}
          placeholder={products.length === 0 ? 'No products in this project' : 'Select a product…'}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={products.length === 0}
        />
      </FormField>
      {products.length === 0 && (
        <p className="text-xs text-ink-faint mt-2">Add products in the Products tab first.</p>
      )}
    </Modal>
  );
}

// ─── Spec hub page ─────────────────────────────────────────────────────────

export default function ProjectSpecPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { project } = useProjectContext();
  const { documents, loading, reload } = useSpecDocuments(params.id);
  const { comparisons, reload: reloadComparisons } = useSpecComparisons(params.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [compareTarget, setCompareTarget] = useState<{ specDocId: string } | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  function handleSetActive(doc: SpecDocument) {
    reload();
  }

  function handleExtracted() {
    reload();
  }

  function handleDiff(fromId: string, toId: string) {
    router.push(`/projects/${params.id}/spec/${fromId}?diff=${toId}`);
  }

  const activeDoc = documents.find((d) => d.is_active);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Project Specification</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Define and review project specification requirements. Extract requirements from uploaded spec documents and compare against product datasheets.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Version
        </Button>
      </div>

      {/* Active spec callout */}
      {activeDoc && (
        <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-soft/30 px-4 py-3">
          <FileText className="h-4 w-4 text-success shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">
              Active version: <span className="text-success">{activeDoc.title}</span>
              <span className="ml-2 text-xs text-ink-muted">({activeDoc.version_label})</span>
            </p>
          </div>
          <button
            onClick={() => router.push(`/projects/${params.id}/spec/${activeDoc.id}`)}
            className="text-xs text-primary hover:underline"
          >
            View requirements →
          </button>
        </div>
      )}

      {/* Version cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-border bg-surface-subtle animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-xl bg-surface-subtle p-4 text-ink-faint">
              <FileText className="h-8 w-8" />
            </div>
            <p className="font-medium text-ink">No project spec uploaded yet</p>
            <p className="max-w-sm text-sm text-ink-faint">
              Start by uploading your project specification document. Once uploaded, extract structured requirements and compare them against your products.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add First Version
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <SpecVersionCard
              key={doc.id}
              doc={doc}
              allDocs={documents}
              requirementCount={doc.requirement_count}
              onSetActive={handleSetActive}
              onExtracted={handleExtracted}
              onViewDetails={(d) => router.push(`/projects/${params.id}/spec/${d.id}`)}
              onCompare={(fromId, toId) => router.push(`/projects/${params.id}/spec/${fromId}?diff=${toId}`)}
            />
          ))}
        </div>
      )}

      {/* Comparison run history */}
      {comparisons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {comparisons.slice(0, 8).map((run) => (
                <button
                  key={run.id}
                  onClick={() => router.push(`/projects/${params.id}/spec/comparison/${run.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-surface-hover transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{run.target_label ?? 'Product comparison'}</p>
                    <p className="text-xs text-ink-faint">{formatDate(run.compared_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-success font-medium">{run.compliant_count} ✓</span>
                    <span className="text-danger font-medium">{run.deviated_count + run.missing_count} ✗</span>
                    {run.review_needed_count > 0 && (
                      <span className="text-info font-medium">{run.review_needed_count} ?</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <NewSpecModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={params.id}
        onCreated={reload}
      />
    </div>
  );
}
