'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Trash2, FileText, Link2, Link2Off, Star, Ban } from 'lucide-react';
import { useProductById } from '@/hooks/use-products';
import { useProjectFiles } from '@/hooks/use-project-files';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { AttributeEditor } from '@/components/products/AttributeEditor';
import { ProductFormModal } from '@/components/products/ProductFormModal';
import { ExtractionPanel } from '@/components/products/ExtractionPanel';
import { formatDate } from '@/lib/utils';
import type { ProductAttribute, ProductWithDetails, MappedProjectFile } from '@/types';

function statusVariant(s: string) {
  if (s === 'approved') return 'success' as const;
  if (s === 'reviewed') return 'info' as const;
  return 'neutral' as const;
}

function sourceVariant(s: string) {
  return s === 'pdf_extract' ? 'info' as const : 'neutral' as const;
}

// ─── Linked files panel ────────────────────────────────────────────────────

interface LinkedFilesPanelProps {
  productId: string;
  projectId: string;
  linkedFileIds: Set<string>;
  projectFiles: MappedProjectFile[];
  onLinked: () => void;
}

function LinkedFilesPanel({ productId, projectId, linkedFileIds, projectFiles, onLinked }: LinkedFilesPanelProps) {
  const { token } = useAuth();
  const [error, setError] = useState('');

  const linked = projectFiles.filter((pf) => linkedFileIds.has(pf.id));
  const available = projectFiles.filter((pf) => !linkedFileIds.has(pf.id));

  async function handleLink(projectFileId: string) {
    if (!token) return;
    setError('');
    try {
      await api.products.linkFile(token, productId, projectFileId);
      onLinked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to link file.');
    }
  }

  async function handleUnlink(projectFileId: string) {
    if (!token) return;
    setError('');
    try {
      await api.products.unlinkFile(token, productId, projectFileId);
      onLinked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to unlink file.');
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error" onDismiss={() => setError('')}>{error}</Alert>}

      {linked.length === 0 && (
        <p className="text-sm text-slate-400">No files linked to this product yet.</p>
      )}

      {linked.map((pf) => (
        <div key={pf.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{pf.file_name}</p>
              <p className="text-xs text-slate-500">{pf.category_name} · {pf.document_type_name}</p>
            </div>
          </div>
          <button
            onClick={() => handleUnlink(pf.id)}
            className="ml-2 shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Unlink from product"
          >
            <Link2Off className="h-4 w-4" />
          </button>
        </div>
      ))}

      {available.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-2">Link additional files:</p>
          {available.map((pf) => (
            <div key={pf.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                <span className="truncate text-sm text-slate-600">{pf.file_name}</span>
                <span className="text-xs text-slate-400">{pf.document_type_name}</span>
              </div>
              <button
                onClick={() => handleLink(pf.id)}
                className="ml-2 shrink-0 flex items-center gap-1 rounded px-2 py-0.5 text-xs text-brand hover:bg-brand/10"
              >
                <Link2 className="h-3.5 w-3.5" />
                Link
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Product detail page ───────────────────────────────────────────────────

export default function ProductDetailPage({ params }: { params: { id: string; productId: string } }) {
  const router = useRouter();
  const { token } = useAuth();
  const { product, setProduct, loading, error, reload } = useProductById(params.productId);
  const { projectFiles } = useProjectFiles(params.id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!token || !product) return;
    if (!confirm(`Delete product "${product.model_number ?? 'this product'}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.products.delete(token, product.id);
      router.push(`/projects/${params.id}/products`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete product.');
      setDeleting(false);
    }
  }

  function handleAttrsSaved(attrs: ProductAttribute[]) {
    if (!product) return;
    setProduct({ ...product, attributes: attrs });
  }

  function handleExtracted(attrs: ProductAttribute[]) {
    if (!product) return;
    setProduct({ ...product, attributes: attrs, source_type: 'pdf_extract' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <Alert variant="error">
        {error ?? 'Product not found.'}{' '}
        <Link href={`/projects/${params.id}/products`} className="underline">Back to products.</Link>
      </Alert>
    );
  }

  const linkedFileIds = new Set(product.linked_files.map((lf) => lf.id));
  const linkedProjectFiles = projectFiles.filter((pf) => linkedFileIds.has(pf.id));

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link
        href={`/projects/${params.id}/products`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        Products
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">
              {product.model_number ?? <span className="text-ink-faint italic">No model number</span>}
            </h1>
            <Badge variant={statusVariant(product.status)}>{product.status}</Badge>
            <Badge variant={sourceVariant(product.source_type)}>
              {product.source_type === 'pdf_extract' ? 'Extracted' : 'Manual'}
            </Badge>
            {product.is_preferred && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
                <Star className="h-3 w-3" />Preferred
              </span>
            )}
            {product.is_do_not_use && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
                <Ban className="h-3 w-3" />Do Not Use
              </span>
            )}
          </div>
          {product.manufacturer && <p className="mt-0.5 text-sm text-ink-muted">{product.manufacturer}</p>}
          {product.family_name && <p className="text-sm text-ink-faint">{product.family_name}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Workspace flags */}
          <button
            onClick={async () => {
              if (!token) return;
              try {
                const updated = await api.products.setWorkspaceFlags(token, product.id, { is_preferred: !product.is_preferred });
                setProduct(updated);
              } catch {}
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              product.is_preferred
                ? 'border-warning/30 bg-warning-soft text-warning'
                : 'border-border bg-surface text-ink-muted hover:bg-surface-hover'
            }`}
            title="Mark as preferred in workspace — boosts in candidate suggestions"
          >
            <Star className="h-3.5 w-3.5" />
            {product.is_preferred ? 'Preferred' : 'Mark preferred'}
          </button>
          <button
            onClick={async () => {
              if (!token) return;
              if (!product.is_do_not_use && !confirm('Mark this product as "Do Not Use"? It will be excluded from all candidate suggestions.')) return;
              try {
                const updated = await api.products.setWorkspaceFlags(token, product.id, { is_do_not_use: !product.is_do_not_use });
                setProduct(updated);
              } catch {}
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              product.is_do_not_use
                ? 'border-danger/30 bg-danger-soft text-danger'
                : 'border-border bg-surface text-ink-muted hover:bg-surface-hover'
            }`}
            title="Exclude from all candidate suggestions"
          >
            <Ban className="h-3.5 w-3.5" />
            {product.is_do_not_use ? 'Do Not Use' : 'Mark DNU'}
          </button>
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} loading={deleting}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Info card */}
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Category</span>
              <span>{product.category_name ?? <span className="text-slate-400">—</span>}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Source</span>
              <span>{product.source_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <Badge variant={statusVariant(product.status)}>{product.status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Created</span>
              <span>{formatDate(product.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Updated</span>
              <span>{formatDate(product.updated_at)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Attribute editor — wide column */}
        <Card className="lg:col-span-3">
          <CardContent className="pt-5">
            <AttributeEditor
              productId={product.id}
              initialAttributes={product.attributes}
              onSaved={handleAttrsSaved}
            />
          </CardContent>
        </Card>
      </div>

      {/* Linked files */}
      <Card>
        <CardHeader>
          <CardTitle>Linked Files</CardTitle>
          <p className="text-xs text-slate-500">
            Files associated with this product. Link mapped project files to connect datasheets and documents.
          </p>
        </CardHeader>
        <CardContent>
          <LinkedFilesPanel
            productId={product.id}
            projectId={params.id}
            linkedFileIds={linkedFileIds}
            projectFiles={projectFiles}
            onLinked={reload}
          />
        </CardContent>
      </Card>

      {/* Extraction panel — only shown when files are linked */}
      <ExtractionPanel
        productId={product.id}
        linkedProjectFiles={linkedProjectFiles}
        currentAttributes={product.attributes}
        onExtracted={handleExtracted}
      />

      <ProductFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        projectId={params.id}
        product={product}
        onSuccess={(updated) => {
          setProduct(updated);
          setEditOpen(false);
        }}
      />
    </div>
  );
}
