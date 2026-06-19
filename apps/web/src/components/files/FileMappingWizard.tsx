'use client';

import { useState, useEffect } from 'react';
import { FileText, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { CreateCategoryModal } from '@/components/categories/CreateCategoryModal';
import { formatFileSize } from '@/lib/upload-client';
import { cn } from '@/lib/utils';
import type {
  UploadedFile,
  Category,
  DocumentType,
  ConsultantTemplateSectionWithRules,
  MappedProjectFile,
  ProjectFileRequiredStatus,
  CategoryDetail,
} from '@/types';

// ─── Step indicator ────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
              step === current
                ? 'bg-brand text-white'
                : step < current
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-500',
            )}
          >
            {step < current ? '✓' : step}
          </div>
          {step < total && <div className={cn('h-0.5 w-6', step < current ? 'bg-emerald-400' : 'bg-slate-200')} />}
        </div>
      ))}
    </div>
  );
}

// ─── File header strip ─────────────────────────────────────────────────────

function FileStrip({ file }: { file: UploadedFile }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5 mb-4">
      <FileText className="h-5 w-5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{file.original_file_name}</p>
        <p className="text-xs text-slate-400">
          {file.mime_label}
          {file.file_size_bytes ? ` · ${formatFileSize(file.file_size_bytes)}` : ''}
        </p>
      </div>
    </div>
  );
}

// ─── Wizard form state ─────────────────────────────────────────────────────

interface WizardForm {
  category_id: string;
  document_type_id: string;
  consultant_template_section_id: string;
  required_status: ProjectFileRequiredStatus;
  notes: string;
}

const EMPTY_FORM: WizardForm = {
  category_id: '',
  document_type_id: '',
  consultant_template_section_id: '',
  required_status: 'required',
  notes: '',
};

// ─── FileMappingWizard ─────────────────────────────────────────────────────

interface FileMappingWizardProps {
  open: boolean;
  onClose: () => void;
  file: UploadedFile;
  projectId: string;
  /** The project's consultant template ID. Null if no template assigned. */
  templateId: string | null;
  onSuccess: (projectFile: MappedProjectFile) => void;
  /** For edit mode — pre-fills the form and calls PATCH instead of POST. */
  initialValues?: Partial<WizardForm>;
  projectFileId?: string;
}

export function FileMappingWizard({
  open,
  onClose,
  file,
  projectId,
  templateId,
  onSuccess,
  initialValues,
  projectFileId,
}: FileMappingWizardProps) {
  const { token } = useAuth();
  const isEdit = !!projectFileId;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);

  // Data for dropdowns
  const [categories, setCategories] = useState<Category[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [sections, setSections] = useState<ConsultantTemplateSectionWithRules[]>([]);

  useEffect(() => {
    if (!open || !token) return;
    setStep(1);
    setForm(initialValues ? { ...EMPTY_FORM, ...initialValues } : EMPTY_FORM);
    setError('');

    // Load all required data in parallel
    Promise.all([
      api.categories.list(token),
      api.documentTypes.list(token),
      templateId ? api.templates.get(token, templateId) : Promise.resolve(null),
    ]).then(([cats, dts, tmpl]) => {
      setCategories(cats.filter((c) => c.is_active));
      setDocumentTypes(dts.filter((dt) => dt.is_active));
      setSections(tmpl?.sections ?? []);
    }).catch(() => {});
  }, [open, token, templateId, initialValues]);

  function setField<K extends keyof WizardForm>(key: K, value: WizardForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  function handleCategoryCreated(newCategory: CategoryDetail) {
    setCategories((prev) => [...prev, newCategory]);
    setField('category_id', newCategory.id);
    setCreateCategoryOpen(false);
  }

  function validateStep(): string | null {
    if (step === 1 && !form.category_id) return 'Choose a category before continuing.';
    if (step === 2 && !form.document_type_id) return 'Choose a document type before continuing.';
    if (step === 3 && !form.consultant_template_section_id)
      return 'Choose where this file should appear in the consultant submittal package.';
    return null;
  }

  function goNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  }

  function goBack() {
    setError('');
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  }

  async function save() {
    const err = validateStep();
    if (err) { setError(err); return; }
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        category_id: form.category_id,
        document_type_id: form.document_type_id,
        consultant_template_section_id: form.consultant_template_section_id,
        required_status: form.required_status,
        notes: form.notes.trim() || null,
      };

      let result: MappedProjectFile;
      if (isEdit && projectFileId) {
        result = await api.projectFiles.update(token, projectFileId, payload);
      } else {
        result = await api.projectFiles.create(token, projectId, { file_id: file.id, ...payload });
      }
      onSuccess(result);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save mapping.');
    } finally {
      setSaving(false);
    }
  }

  // Helper: name of selected items (for breadcrumb)
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const selectedDocType = documentTypes.find((dt) => dt.id === form.document_type_id);
  const selectedSection = sections.find((s) => s.id === form.consultant_template_section_id);

  function stepSubtitle() {
    const parts: string[] = [];
    if (step >= 2 && selectedCategory) parts.push(selectedCategory.name);
    if (step >= 3 && selectedDocType) parts.push(selectedDocType.name);
    return parts.length > 0 ? parts.join(' → ') : null;
  }

  const stepTitles = [
    'Which category should this file belong to?',
    'What type of document is this?',
    'Where should this file appear in the submittal package?',
  ];

  const footer = (
    <>
      {step > 1 && (
        <Button variant="secondary" onClick={goBack} disabled={saving}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      {step < 3 ? (
        <Button onClick={goNext}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button onClick={save} loading={saving}>
          {isEdit ? 'Save Changes' : 'Save Mapping'}
        </Button>
      )}
    </>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? 'Edit File Mapping' : 'Assign File to Project'}
        size="md"
        footer={footer}
      >
        <div className="space-y-4">
          {/* Step indicator */}
          <div className="flex items-center justify-between">
            <StepIndicator current={step} total={3} />
            {stepSubtitle() && (
              <span className="text-xs text-slate-400 truncate max-w-[200px]">{stepSubtitle()}</span>
            )}
          </div>

          {/* File strip */}
          <FileStrip file={file} />

          {/* Step title */}
          <p className="text-sm font-medium text-slate-700">{stepTitles[step - 1]}</p>

          {error && <Alert variant="error">{error}</Alert>}

          {/* ── Step 1: Category ── */}
          {step === 1 && (
            <div className="space-y-3">
              <FormField label="Category" htmlFor="wiz_cat" required>
                <Select
                  id="wiz_cat"
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.is_system_defined ? `${c.name} (System)` : c.name,
                  }))}
                  placeholder="Select a category..."
                  value={form.category_id}
                  onChange={(e) => setField('category_id', e.target.value)}
                />
              </FormField>
              <button
                type="button"
                onClick={() => setCreateCategoryOpen(true)}
                className="flex items-center gap-1.5 text-sm text-brand hover:text-brand-dark font-medium"
              >
                <Plus className="h-4 w-4" />
                Create a new category
              </button>
              {!templateId && (
                <Alert variant="warning">
                  This project has no consultant template assigned. You can still map files, but exports will be blocked until a template is set.
                </Alert>
              )}
            </div>
          )}

          {/* ── Step 2: Document Type ── */}
          {step === 2 && (
            <FormField label="Document Type" htmlFor="wiz_dt" required>
              <Select
                id="wiz_dt"
                options={documentTypes.map((dt) => ({
                  value: dt.id,
                  label: dt.code ? `${dt.name} (${dt.code})` : dt.name,
                }))}
                placeholder="Select a document type..."
                value={form.document_type_id}
                onChange={(e) => setField('document_type_id', e.target.value)}
              />
            </FormField>
          )}

          {/* ── Step 3: Section + details ── */}
          {step === 3 && (
            <div className="space-y-4">
              <FormField label="Consultant Submittal Section" htmlFor="wiz_sec" required>
                {sections.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    No sections available. {templateId ? 'Add sections to the consultant template first.' : 'Assign a consultant template to this project first.'}
                  </div>
                ) : (
                  <Select
                    id="wiz_sec"
                    options={sections.map((s) => ({
                      value: s.id,
                      label: s.section_code ? `${s.section_name} (${s.section_code})` : s.section_name,
                    }))}
                    placeholder="Select a section..."
                    value={form.consultant_template_section_id}
                    onChange={(e) => setField('consultant_template_section_id', e.target.value)}
                  />
                )}
                {/* Show required badge for selected section */}
                {selectedSection && (
                  <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                    <Badge variant={selectedSection.is_required ? 'danger' : 'neutral'} className="text-xs">
                      {selectedSection.is_required ? 'Required' : 'Optional'}
                    </Badge>
                    {selectedSection.description}
                  </p>
                )}
              </FormField>

              <FormField label="Is this file required, optional, or for reference?" htmlFor="wiz_req">
                <Select
                  id="wiz_req"
                  options={[
                    { value: 'required', label: 'Required — must be present for export' },
                    { value: 'optional', label: 'Optional — included if available' },
                    { value: 'reference', label: 'Reference only — not included in export' },
                  ]}
                  value={form.required_status}
                  onChange={(e) => setField('required_status', e.target.value as ProjectFileRequiredStatus)}
                />
              </FormField>

              <FormField label="Notes" htmlFor="wiz_notes">
                <Textarea
                  id="wiz_notes"
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Optional — e.g. Primary datasheet, Rev B"
                  rows={2}
                />
              </FormField>
            </div>
          )}
        </div>
      </Modal>

      {/* Inline category creation — opens on top of the wizard */}
      <CreateCategoryModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onSuccess={handleCategoryCreated}
      />
    </>
  );
}
