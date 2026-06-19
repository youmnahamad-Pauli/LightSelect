'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Alert } from '@/components/ui/alert';
import { useCategories } from '@/hooks/use-categories';
import type { ProductWithDetails, ProductListItem, ProductStatus } from '@/types';

interface FormValues {
  manufacturer: string;
  family_name: string;
  model_number: string;
  category_id: string;
  status: ProductStatus;
}

const EMPTY: FormValues = {
  manufacturer: '',
  family_name: '',
  model_number: '',
  category_id: '',
  status: 'draft',
};

function productToForm(p: ProductWithDetails | ProductListItem): FormValues {
  return {
    manufacturer: p.manufacturer ?? '',
    family_name: p.family_name ?? '',
    model_number: p.model_number ?? '',
    category_id: p.category_id ?? '',
    status: p.status,
  };
}

function nullable(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  product?: ProductWithDetails | ProductListItem;
  onSuccess: (product: ProductWithDetails) => void;
}

export function ProductFormModal({ open, onClose, projectId, product, onSuccess }: ProductFormModalProps) {
  const { token } = useAuth();
  const { categories } = useCategories();
  const isEdit = !!product;

  const [form, setForm] = useState<FormValues>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(product ? productToForm(product) : EMPTY);
      setError('');
    }
  }, [open, product]);

  function field(key: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function submit() {
    if (!token) return;
    setLoading(true);
    setError('');
    const payload = {
      manufacturer: nullable(form.manufacturer),
      family_name: nullable(form.family_name),
      model_number: nullable(form.model_number),
      category_id: nullable(form.category_id),
      status: form.status,
    };
    try {
      let result: ProductWithDetails;
      if (isEdit && product) {
        result = await api.products.update(token, product.id, payload);
      } else {
        result = await api.products.create(token, projectId, payload);
      }
      onSuccess(result);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Product' : 'Add Product'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} loading={loading}>{isEdit ? 'Save Changes' : 'Add Product'}</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Manufacturer" htmlFor="p_mfr">
            <Input id="p_mfr" value={form.manufacturer} onChange={field('manufacturer')} placeholder="e.g. Signify" autoFocus />
          </FormField>
          <FormField label="Product Family" htmlFor="p_fam">
            <Input id="p_fam" value={form.family_name} onChange={field('family_name')} placeholder="e.g. GreenVision Xceed" />
          </FormField>
        </div>
        <FormField label="Model Number" htmlFor="p_model">
          <Input id="p_model" value={form.model_number} onChange={field('model_number')} placeholder="e.g. BRP381 LED140/NW" />
        </FormField>
        <FormField label="Category" htmlFor="p_cat">
          <Select
            id="p_cat"
            options={categories.map((c) => ({ value: c.id, label: c.is_system_defined ? `${c.name} (System)` : c.name }))}
            placeholder="Select a category..."
            value={form.category_id}
            onChange={field('category_id')}
          />
        </FormField>
        <FormField label="Status" htmlFor="p_status">
          <Select
            id="p_status"
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'approved', label: 'Approved' },
            ]}
            value={form.status}
            onChange={field('status')}
          />
        </FormField>
      </div>
    </Modal>
  );
}
