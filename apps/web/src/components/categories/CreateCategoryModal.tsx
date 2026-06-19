'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, type SelectOption } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import type { Category, CategoryDetail, DocumentType } from '@/types';

interface FormValues {
  name: string;
  description: string;
  parent_category_id: string;
}

const EMPTY: FormValues = { name: '', description: '', parent_category_id: '' };

interface CreateCategoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the newly created category on success. */
  onSuccess: (category: CategoryDetail) => void;
  /** Pre-select a parent category (e.g. when creating from a parent context). */
  defaultParentId?: string;
}

/**
 * Self-contained modal for creating a custom category.
 * Designed to be reused in the upload flow (Priority 6) without modification.
 * Does not depend on any external state — fetches its own data.
 */
export function CreateCategoryModal({
  open,
  onClose,
  onSuccess,
  defaultParentId,
}: CreateCategoryModalProps) {
  const { token } = useAuth();

  const [form, setForm] = useState<FormValues>(EMPTY);
  const [selectedDocTypeIds, setSelectedDocTypeIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [parentOptions, setParentOptions] = useState<SelectOption[]>([]);
  const [docTypeOptions, setDocTypeOptions] = useState<DocumentType[]>([]);

  // Load supporting data when modal opens
  useEffect(() => {
    if (!open || !token) return;
    setForm({ ...EMPTY, parent_category_id: defaultParentId ?? '' });
    setSelectedDocTypeIds([]);
    setError('');

    api.categories
      .list(token)
      .then((cats) =>
        setParentOptions(
          cats
            .filter((c) => c.is_active)
            .map((c) => ({ value: c.id, label: c.is_system_defined ? `${c.name} (System)` : c.name })),
        ),
      )
      .catch(() => {});

    api.documentTypes
      .list(token)
      .then(setDocTypeOptions)
      .catch(() => {});
  }, [open, token, defaultParentId]);

  function field(key: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function addDocType(id: string) {
    if (!id || selectedDocTypeIds.includes(id)) return;
    setSelectedDocTypeIds((prev) => [...prev, id]);
  }

  function removeDocType(id: string) {
    setSelectedDocTypeIds((prev) => prev.filter((x) => x !== id));
  }

  const availableDocTypes = docTypeOptions.filter((dt) => !selectedDocTypeIds.includes(dt.id));
  const selectedDocTypes = docTypeOptions.filter((dt) => selectedDocTypeIds.includes(dt.id));

  async function submit() {
    if (!form.name.trim()) {
      setError('Category name is required.');
      return;
    }
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const created = await api.categories.create(token, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        parent_category_id: form.parent_category_id || null,
        default_document_type_ids: selectedDocTypeIds,
      });
      onSuccess(created);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create category.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Category"
      description="Custom categories are available across all your projects."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            Save and Assign
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-4">
        <FormField label="Category Name" htmlFor="cat_name" required>
          <Input
            id="cat_name"
            value={form.name}
            onChange={field('name')}
            placeholder="e.g. Architectural Facade Lighting"
            autoFocus
          />
        </FormField>

        <FormField
          label="Parent Category"
          htmlFor="cat_parent"
          hint="Optional — groups this category under an existing one."
        >
          <Select
            id="cat_parent"
            options={parentOptions}
            placeholder="No parent (top-level)"
            value={form.parent_category_id}
            onChange={field('parent_category_id')}
          />
        </FormField>

        <FormField label="Description" htmlFor="cat_desc">
          <Textarea
            id="cat_desc"
            value={form.description}
            onChange={field('description')}
            placeholder="Optional description for this category"
            rows={2}
          />
        </FormField>

        {/* Default document type requirements */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            Default Required Document Types
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Files uploaded under this category will require these document types by default.
          </p>

          {/* Selected chips */}
          {selectedDocTypes.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedDocTypes.map((dt) => (
                <span
                  key={dt.id}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand"
                >
                  {dt.name}
                  {dt.code && <span className="opacity-60">({dt.code})</span>}
                  <button
                    onClick={() => removeDocType(dt.id)}
                    className="ml-0.5 rounded-full hover:text-brand/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add dropdown */}
          {availableDocTypes.length > 0 && (
            <Select
              options={availableDocTypes.map((dt) => ({
                value: dt.id,
                label: dt.code ? `${dt.name} (${dt.code})` : dt.name,
              }))}
              placeholder="+ Add document type..."
              value=""
              onChange={(e) => addDocType(e.target.value)}
            />
          )}
          {availableDocTypes.length === 0 && selectedDocTypes.length > 0 && (
            <p className="text-xs text-slate-400">All document types assigned.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
