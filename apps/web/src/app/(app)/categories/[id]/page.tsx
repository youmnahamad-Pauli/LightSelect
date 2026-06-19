'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Archive, Plus, X } from 'lucide-react';
import { useCategoryById } from '@/hooks/use-categories';
import { useDocumentTypes } from '@/hooks/use-document-types';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { formatDate } from '@/lib/utils';
import type { CategoryDetail } from '@/types';

// ─── Edit modal ────────────────────────────────────────────────────────────

interface EditCategoryModalProps {
  open: boolean;
  onClose: () => void;
  category: CategoryDetail;
  onSuccess: () => void;
}

function EditCategoryModal({ open, onClose, category, onSuccess }: EditCategoryModalProps) {
  const { token } = useAuth();
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await api.categories.update(token, category.id, {
        name: name.trim(),
        description: description.trim() || null,
        parent_category_id: category.parent_category_id,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Category"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} loading={loading}>Save Changes</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="space-y-3">
        <FormField label="Name" htmlFor="e_name" required>
          <Input id="e_name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description" htmlFor="e_desc">
          <Textarea id="e_desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>
      </div>
    </Modal>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function CategoryDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { token } = useAuth();
  const { category, loading, error, reload } = useCategoryById(params.id);
  const { documentTypes } = useDocumentTypes();

  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [addingReq, setAddingReq] = useState(false);
  const [actionError, setActionError] = useState('');

  async function handleArchive() {
    if (!token || !category) return;
    if (!confirm(`Archive "${category.name}"?`)) return;
    setArchiving(true);
    try {
      await api.categories.archive(token, category.id);
      router.push('/categories');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to archive.');
      setArchiving(false);
    }
  }

  async function handleAddRequirement(docTypeId: string) {
    if (!token || !category || !docTypeId) return;
    setAddingReq(true);
    setActionError('');
    try {
      await api.categories.addRequirement(token, category.id, { document_type_id: docTypeId });
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to add requirement.');
    } finally {
      setAddingReq(false);
    }
  }

  async function handleRemoveRequirement(reqId: string) {
    if (!token) return;
    try {
      await api.categories.removeRequirement(token, reqId);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to remove.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
      </div>
    );
  }

  if (error || !category) {
    return (
      <Alert variant="error">
        {error ?? 'Category not found.'}{' '}
        <Link href="/categories" className="underline">Go back.</Link>
      </Alert>
    );
  }

  const assignedDocTypeIds = new Set(category.requirements.map((r) => r.document_type_id));
  const availableDocTypes = documentTypes.filter((dt) => !assignedDocTypeIds.has(dt.id));

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link href="/categories" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors">
        <ChevronLeft className="h-3 w-3" />
        Categories
      </Link>

      {actionError && (
        <Alert variant="error" onDismiss={() => setActionError('')}>{actionError}</Alert>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{category.name}</h1>
            <Badge variant={category.is_system_defined ? 'info' : 'default'}>
              {category.is_system_defined ? 'System' : 'Custom'}
            </Badge>
            <Badge variant={category.is_active ? 'success' : 'neutral'}>
              {category.is_active ? 'Active' : 'Archived'}
            </Badge>
          </div>
          {category.parent_name && (
            <p className="mt-0.5 text-sm text-slate-500">Parent: {category.parent_name}</p>
          )}
          {category.description && (
            <p className="mt-1 text-sm text-slate-600">{category.description}</p>
          )}
        </div>

        {!category.is_system_defined && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            {category.is_active && (
              <Button variant="ghost" size="sm" onClick={handleArchive} loading={archiving}>
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Details card */}
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Slug</span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{category.slug}</code>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Created</span>
              <span>{formatDate(category.created_at)}</span>
            </div>
            {category.children.length > 0 && (
              <div>
                <p className="text-slate-500 mb-1">Subcategories</p>
                <div className="flex flex-wrap gap-1">
                  {category.children.map((c) => (
                    <Badge key={c.id} variant={c.is_active ? 'default' : 'neutral'}>{c.name}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document requirements card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Default Required Document Types</CardTitle>
            <p className="text-xs text-slate-500">
              Files uploaded under this category will require these document types by default.
            </p>
          </CardHeader>
          <CardContent>
            {category.requirements.length === 0 && (
              <p className="text-sm text-slate-400 mb-3">No default requirements set.</p>
            )}

            <div className="space-y-2 mb-4">
              {category.requirements.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{req.document_type_name}</span>
                    {req.document_type_code && (
                      <code className="text-xs text-slate-500">{req.document_type_code}</code>
                    )}
                    <Badge variant={req.is_required ? 'danger' : 'neutral'} className="text-xs">
                      {req.is_required ? 'Required' : 'Optional'}
                    </Badge>
                  </div>
                  {!category.is_system_defined && (
                    <button
                      onClick={() => handleRemoveRequirement(req.id)}
                      className="rounded p-1 text-slate-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!category.is_system_defined && availableDocTypes.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  options={availableDocTypes.map((dt) => ({
                    value: dt.id,
                    label: dt.code ? `${dt.name} (${dt.code})` : dt.name,
                  }))}
                  placeholder="+ Add document type..."
                  value=""
                  onChange={(e) => handleAddRequirement(e.target.value)}
                  disabled={addingReq}
                  className="flex-1"
                />
                {addingReq && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stub for Priority 7: Product attribute schema */}
      <Card>
        <CardHeader>
          <CardTitle>Product Attribute Schema</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Required and optional product fields per category are configured in Priority 7 (Products module).
          </p>
        </CardContent>
      </Card>

      {!category.is_system_defined && (
        <EditCategoryModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          category={category}
          onSuccess={reload}
        />
      )}
    </div>
  );
}
