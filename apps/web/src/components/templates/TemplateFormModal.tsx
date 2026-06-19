'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Alert } from '@/components/ui/alert';
import type { ConsultantTemplate } from '@/types';

interface FormValues {
  consultant_name: string;
  template_name: string;
  version: string;
  description: string;
}

const EMPTY: FormValues = {
  consultant_name: '',
  template_name: '',
  version: '',
  description: '',
};

function templateToForm(t: ConsultantTemplate): FormValues {
  return {
    consultant_name: t.consultant_name,
    template_name: t.template_name,
    version: t.version ?? '',
    description: t.description ?? '',
  };
}

function nullable(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

interface TemplateFormModalProps {
  open: boolean;
  onClose: () => void;
  template?: ConsultantTemplate;
  onSuccess?: () => void;
}

export function TemplateFormModal({ open, onClose, template, onSuccess }: TemplateFormModalProps) {
  const { token } = useAuth();
  const router = useRouter();
  const isEdit = !!template;

  const [form, setForm] = useState<FormValues>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(template ? templateToForm(template) : EMPTY);
      setError('');
    }
  }, [open, template]);

  function field(key: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function submit() {
    if (!form.consultant_name.trim()) {
      setError('Consultant name is required.');
      return;
    }
    if (!form.template_name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!token) return;
    setLoading(true);
    setError('');

    const payload = {
      consultant_name: form.consultant_name.trim(),
      template_name: form.template_name.trim(),
      version: nullable(form.version),
      description: nullable(form.description),
    };

    try {
      if (isEdit) {
        await api.templates.update(token, template.id, payload);
        onSuccess?.();
        onClose();
      } else {
        const result = await api.templates.create(token, payload);
        onSuccess?.();
        onClose();
        router.push(`/templates/${result.template.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Template' : 'New Consultant Template'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            {isEdit ? 'Save Changes' : 'Create Template'}
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
        <FormField label="Consultant Name" htmlFor="consultant_name" required>
          <Input
            id="consultant_name"
            value={form.consultant_name}
            onChange={field('consultant_name')}
            placeholder="e.g. AECOM, Atkins, WSP"
            autoFocus
          />
        </FormField>

        <FormField label="Template Name" htmlFor="template_name" required>
          <Input
            id="template_name"
            value={form.template_name}
            onChange={field('template_name')}
            placeholder="e.g. Standard Lighting Submittal"
          />
        </FormField>

        <FormField label="Version" htmlFor="version" hint="Optional label, e.g. v2.1 or 2024.">
          <Input
            id="version"
            value={form.version}
            onChange={field('version')}
            placeholder="e.g. Rev A"
          />
        </FormField>

        <FormField label="Description" htmlFor="description">
          <Textarea
            id="description"
            value={form.description}
            onChange={field('description')}
            placeholder="Notes about when to use this template (optional)"
          />
        </FormField>
      </div>
    </Modal>
  );
}
