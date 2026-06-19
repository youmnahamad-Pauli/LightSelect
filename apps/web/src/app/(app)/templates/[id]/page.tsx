'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Pencil, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTemplateById } from '@/hooks/use-templates';
import { useCategories } from '@/hooks/use-categories';
import { useDocumentTypes } from '@/hooks/use-document-types';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { SectionEditor } from '@/components/templates/SectionEditor';
import { TemplateFormModal } from '@/components/templates/TemplateFormModal';
import { formatDate } from '@/lib/utils';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="w-32 shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{value ?? <span className="text-slate-400">—</span>}</span>
    </div>
  );
}

export default function TemplateDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { token } = useAuth();
  const { data, loading, error, reload } = useTemplateById(params.id);
  const { categories } = useCategories();
  const { documentTypes } = useDocumentTypes();
  const [editOpen, setEditOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [actionError, setActionError] = useState('');

  async function handleDuplicate() {
    if (!token) return;
    setDuplicating(true);
    setActionError('');
    try {
      const result = await api.templates.duplicate(token, params.id);
      router.push(`/templates/${result.template.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to duplicate template.');
    } finally {
      setDuplicating(false);
    }
  }

  async function handleToggleActive() {
    if (!token || !data) return;
    setToggling(true);
    setActionError('');
    try {
      await api.templates.update(token, params.id, { is_active: !data.template.is_active });
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update template.');
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="error">
        {error ?? 'Template not found.'}{' '}
        <Link href="/templates" className="underline">
          Go back to templates.
        </Link>
      </Alert>
    );
  }

  const { template, sections } = data;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/templates"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Consultant Templates
        </Link>
      </div>

      {actionError && (
        <Alert variant="error" onDismiss={() => setActionError('')}>
          {actionError}
        </Alert>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{template.template_name}</h1>
            <Badge variant={template.is_active ? 'success' : 'neutral'}>
              {template.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {template.consultant_name}
            {template.version ? ` · ${template.version}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDuplicate} loading={duplicating}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleActive}
            loading={toggling}
          >
            {template.is_active ? (
              <ToggleLeft className="h-3.5 w-3.5" />
            ) : (
              <ToggleRight className="h-3.5 w-3.5" />
            )}
            {template.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Template details */}
        <Card>
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-0 pb-2">
            <Row label="Consultant" value={template.consultant_name} />
            <Row label="Version" value={template.version} />
            <Row label="Sections" value={<span className="font-semibold">{sections.length}</span>} />
            <Row label="Created" value={formatDate(template.created_at)} />
            <Row label="Last updated" value={formatDate(template.updated_at)} />
            {template.description && (
              <div className="py-2.5">
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-sm text-slate-700">{template.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section editor */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sections</CardTitle>
              <p className="text-xs text-slate-500">
                Sections define where uploaded files appear in the final submittal package.
                Use the arrows to set the order.
              </p>
            </CardHeader>
            <CardContent>
              <SectionEditor
                templateId={template.id}
                initialSections={sections}
                availableCategories={categories}
                availableDocTypes={documentTypes}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <TemplateFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        template={template}
        onSuccess={reload}
      />
    </div>
  );
}
