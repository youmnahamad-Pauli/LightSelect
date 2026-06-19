'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, type SelectOption } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Alert } from '@/components/ui/alert';
import type { Project } from '@/types';

interface FormValues {
  project_name: string;
  client_name: string;
  consultant_name: string;
  project_code: string;
  location: string;
  revision_label: string;
  notes: string;
  consultant_template_id: string;
}

const EMPTY: FormValues = {
  project_name: '',
  client_name: '',
  consultant_name: '',
  project_code: '',
  location: '',
  revision_label: '',
  notes: '',
  consultant_template_id: '',
};

function projectToForm(p: Project): FormValues {
  return {
    project_name: p.project_name,
    client_name: p.client_name ?? '',
    consultant_name: p.consultant_name ?? '',
    project_code: p.project_code ?? '',
    location: p.location ?? '',
    revision_label: p.revision_label ?? '',
    notes: p.notes ?? '',
    consultant_template_id: p.consultant_template_id ?? '',
  };
}

function nullable(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  project?: Project;
  onSuccess?: (project: Project) => void;
}

export function ProjectFormModal({ open, onClose, project, onSuccess }: ProjectFormModalProps) {
  const { token } = useAuth();
  const router = useRouter();
  const isEdit = !!project;

  const [form, setForm] = useState<FormValues>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [templateOptions, setTemplateOptions] = useState<SelectOption[]>([]);

  // Fetch active templates when the modal opens
  useEffect(() => {
    if (open && token) {
      api.templates
        .list(token)
        .then((templates) =>
          setTemplateOptions(
            templates
              .filter((t) => t.is_active)
              .map((t) => ({
                value: t.id,
                label: t.version
                  ? `${t.template_name} — ${t.consultant_name} (${t.version})`
                  : `${t.template_name} — ${t.consultant_name}`,
              })),
          ),
        )
        .catch(() => setTemplateOptions([]));
    }
  }, [open, token]);

  useEffect(() => {
    if (open) {
      setForm(project ? projectToForm(project) : EMPTY);
      setError('');
    }
  }, [open, project]);

  function field(key: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function submit(status: 'draft' | 'active' = 'draft') {
    if (!form.project_name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!token) return;
    setLoading(true);
    setError('');

    const payload = {
      project_name: form.project_name.trim(),
      client_name: nullable(form.client_name),
      consultant_name: nullable(form.consultant_name),
      project_code: nullable(form.project_code),
      location: nullable(form.location),
      revision_label: nullable(form.revision_label),
      notes: nullable(form.notes),
      consultant_template_id: nullable(form.consultant_template_id),
    };

    try {
      let result: Project;
      if (isEdit) {
        result = await api.projects.update(token, project.id, payload);
      } else {
        result = await api.projects.create(token, { ...payload, status });
      }
      onSuccess?.(result);
      onClose();
      if (!isEdit) {
        router.push(`/projects/${result.id}/overview`);
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
      title={isEdit ? 'Edit Project' : 'New Project'}
      size="lg"
      footer={
        <>
          {!isEdit && (
            <Button variant="secondary" onClick={() => submit('draft')} loading={loading}>
              Save Draft
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => submit(isEdit ? 'draft' : 'active')} loading={loading}>
            {isEdit ? 'Save Changes' : 'Create Project'}
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Project Name" htmlFor="project_name" required className="col-span-2">
          <Input
            id="project_name"
            value={form.project_name}
            onChange={field('project_name')}
            placeholder="e.g. Dubai Hills Boulevard Lighting"
            autoFocus
          />
        </FormField>

        <FormField label="Client" htmlFor="client_name">
          <Input
            id="client_name"
            value={form.client_name}
            onChange={field('client_name')}
            placeholder="Client name"
          />
        </FormField>

        <FormField label="Location" htmlFor="location">
          <Input
            id="location"
            value={form.location}
            onChange={field('location')}
            placeholder="City or location"
          />
        </FormField>

        <FormField label="Internal Code" htmlFor="project_code">
          <Input
            id="project_code"
            value={form.project_code}
            onChange={field('project_code')}
            placeholder="e.g. DHB-001"
          />
        </FormField>

        <FormField label="Revision" htmlFor="revision_label">
          <Input
            id="revision_label"
            value={form.revision_label}
            onChange={field('revision_label')}
            placeholder="e.g. Rev 0"
          />
        </FormField>

        <FormField label="Consultant" htmlFor="consultant_name">
          <Input
            id="consultant_name"
            value={form.consultant_name}
            onChange={field('consultant_name')}
            placeholder="Consulting firm or engineer"
          />
        </FormField>

        <FormField
          label="Consultant Template"
          htmlFor="consultant_template_id"
          hint={
            templateOptions.length === 0
              ? 'No active templates yet — create one under Templates first.'
              : undefined
          }
        >
          <Select
            id="consultant_template_id"
            options={templateOptions}
            placeholder={
              templateOptions.length === 0
                ? 'No templates available'
                : 'Select a consultant template...'
            }
            value={form.consultant_template_id}
            onChange={field('consultant_template_id')}
            disabled={templateOptions.length === 0}
          />
        </FormField>

        <FormField label="Notes" htmlFor="notes" className="col-span-2">
          <Textarea
            id="notes"
            value={form.notes}
            onChange={field('notes')}
            placeholder="Internal notes (optional)"
          />
        </FormField>
      </div>
    </Modal>
  );
}
