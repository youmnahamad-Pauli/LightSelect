'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Pencil, Plus, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type {
  ConsultantTemplateSectionWithRules,
  ConsultantSectionRuleWithNames,
  Category,
  DocumentType,
} from '@/types';

// ─── Toggle ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1',
          checked ? 'bg-brand' : 'bg-slate-200',
        )}
      >
        <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
      </button>
      <span className="text-slate-700">{label}</span>
    </label>
  );
}

// ─── Section inline form ───────────────────────────────────────────────────

interface SectionFormValues {
  section_name: string;
  section_code: string;
  is_required: boolean;
  accepts_multiple_files: boolean;
  description: string;
}

const EMPTY_SECTION: SectionFormValues = { section_name: '', section_code: '', is_required: false, accepts_multiple_files: true, description: '' };

function sectionToForm(s: ConsultantTemplateSectionWithRules): SectionFormValues {
  return { section_name: s.section_name, section_code: s.section_code ?? '', is_required: s.is_required, accepts_multiple_files: s.accepts_multiple_files, description: s.description ?? '' };
}

interface InlineFormProps {
  initial: SectionFormValues;
  loading: boolean;
  error: string;
  onSave: (values: SectionFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}

function InlineForm({ initial, loading, error, onSave, onCancel, submitLabel = 'Save' }: InlineFormProps) {
  const [form, setForm] = useState<SectionFormValues>(initial);
  function field(key: keyof SectionFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));
  }
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Section Name" htmlFor="sn" required className="col-span-2">
          <Input id="sn" value={form.section_name} onChange={field('section_name')} placeholder="e.g. Product Data Sheets" autoFocus />
        </FormField>
        <FormField label="Section Code" htmlFor="sc">
          <Input id="sc" value={form.section_code} onChange={field('section_code')} placeholder="e.g. SEC-02" />
        </FormField>
        <FormField label="Description" htmlFor="sd">
          <Input id="sd" value={form.description} onChange={field('description')} placeholder="Optional description" />
        </FormField>
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle checked={form.is_required} onChange={(v) => setForm((p) => ({ ...p, is_required: v }))} label="Required section" />
        <Toggle checked={form.accepts_multiple_files} onChange={(v) => setForm((p) => ({ ...p, accepts_multiple_files: v }))} label="Accepts multiple files" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} loading={loading}>{submitLabel}</Button>
      </div>
    </div>
  );
}

// ─── Section rules panel ───────────────────────────────────────────────────

interface SectionRulesPanelProps {
  section: ConsultantTemplateSectionWithRules;
  availableCategories: Category[];
  availableDocTypes: DocumentType[];
  onRulesChanged: (rules: ConsultantSectionRuleWithNames[]) => void;
}

function SectionRulesPanel({ section, availableCategories, availableDocTypes, onRulesChanged }: SectionRulesPanelProps) {
  const { token } = useAuth();
  const [rules, setRules] = useState<ConsultantSectionRuleWithNames[]>(section.rules);
  const [error, setError] = useState('');

  const categoryRules = rules.filter((r) => r.category_id);
  const docTypeRules = rules.filter((r) => r.document_type_id && !r.category_id);

  const assignedCatIds = new Set(categoryRules.map((r) => r.category_id));
  const assignedDtIds = new Set(docTypeRules.map((r) => r.document_type_id));

  const freeCats = availableCategories.filter((c) => !assignedCatIds.has(c.id));
  const freeDts = availableDocTypes.filter((dt) => !assignedDtIds.has(dt.id));

  async function addRule(payload: { category_id?: string; document_type_id?: string }) {
    if (!token) return;
    setError('');
    try {
      const created = await api.templates.addRule(token, section.id, payload);
      const updated = [...rules, created];
      setRules(updated);
      onRulesChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add rule.');
    }
  }

  async function removeRule(ruleId: string) {
    if (!token) return;
    setError('');
    try {
      await api.templates.deleteRule(token, section.id, ruleId);
      const updated = rules.filter((r) => r.id !== ruleId);
      setRules(updated);
      onRulesChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove rule.');
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Section Rules — Allowed Categories & Document Types
      </p>
      <p className="text-xs text-slate-400">
        Define which categories and document types are permitted in this section. Used to validate file assignments during upload.
      </p>

      {error && <Alert variant="error" onDismiss={() => setError('')}>{error}</Alert>}

      {/* Allowed categories */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">Allowed Categories</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {categoryRules.length === 0 && (
            <span className="text-xs text-slate-400">All categories allowed (no restrictions set)</span>
          )}
          {categoryRules.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {r.category_name}
              <button onClick={() => removeRule(r.id)} className="ml-0.5 hover:text-emerald-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {freeCats.length > 0 && (
          <Select
            options={freeCats.map((c) => ({ value: c.id, label: c.is_system_defined ? `${c.name} (System)` : c.name }))}
            placeholder="+ Add category..."
            value=""
            onChange={(e) => e.target.value && addRule({ category_id: e.target.value })}
          />
        )}
      </div>

      {/* Allowed document types */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">Allowed Document Types</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {docTypeRules.length === 0 && (
            <span className="text-xs text-slate-400">All document types allowed (no restrictions set)</span>
          )}
          {docTypeRules.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              {r.document_type_name}
              <button onClick={() => removeRule(r.id)} className="ml-0.5 hover:text-sky-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {freeDts.length > 0 && (
          <Select
            options={freeDts.map((dt) => ({ value: dt.id, label: dt.code ? `${dt.name} (${dt.code})` : dt.name }))}
            placeholder="+ Add document type..."
            value=""
            onChange={(e) => e.target.value && addRule({ document_type_id: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

// ─── Section row ───────────────────────────────────────────────────────────

interface SectionRowProps {
  section: ConsultantTemplateSectionWithRules;
  isFirst: boolean;
  isLast: boolean;
  availableCategories: Category[];
  availableDocTypes: DocumentType[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdated: (updated: ConsultantTemplateSectionWithRules) => void;
}

type PanelMode = 'none' | 'edit' | 'rules';

function SectionRow({ section, isFirst, isLast, availableCategories, availableDocTypes, onMoveUp, onMoveDown, onDelete, onUpdated }: SectionRowProps) {
  const { token } = useAuth();
  const [panel, setPanel] = useState<PanelMode>('none');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function togglePanel(mode: PanelMode) {
    setPanel((p) => (p === mode ? 'none' : mode));
    setSaveError('');
  }

  async function handleSave(values: SectionFormValues) {
    if (!values.section_name.trim()) { setSaveError('Section name is required.'); return; }
    if (!token) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api.templates.updateSection(token, section.id, {
        section_name: values.section_name.trim(),
        section_code: values.section_code.trim() || null,
        is_required: values.is_required,
        accepts_multiple_files: values.accepts_multiple_files,
        description: values.description.trim() || null,
      });
      onUpdated(updated);
      setPanel('none');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save section.');
    } finally {
      setSaving(false);
    }
  }

  const ruleCount = section.rules.length;

  return (
    <div className="group">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-shadow group-hover:shadow-sm">
        <span className="w-5 shrink-0 text-center text-xs font-medium text-slate-400">{section.section_order}</span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900">{section.section_name}</span>
            {section.section_code && <span className="text-xs text-slate-400">{section.section_code}</span>}
            <Badge variant={section.is_required ? 'danger' : 'neutral'}>{section.is_required ? 'Required' : 'Optional'}</Badge>
            {!section.accepts_multiple_files && <Badge variant="info">Single file</Badge>}
            {ruleCount > 0 && (
              <Badge variant="neutral">{ruleCount} rule{ruleCount !== 1 ? 's' : ''}</Badge>
            )}
          </div>
          {section.description && <p className="mt-0.5 truncate text-xs text-slate-500">{section.description}</p>}
        </div>

        {/* Move controls */}
        <div className="flex items-center gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30" title="Move up">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30" title="Move down">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => togglePanel('rules')}
            className={cn('rounded px-2 py-1 text-xs font-medium transition-colors', panel === 'rules' ? 'bg-brand/10 text-brand' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}
            title="Manage section rules"
          >
            Rules
          </button>
          <button
            onClick={() => togglePanel('edit')}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Edit section"
          >
            {panel === 'edit' ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
          <button onClick={onDelete} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete section">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {panel === 'edit' && (
        <InlineForm
          initial={sectionToForm(section)}
          loading={saving}
          error={saveError}
          onSave={handleSave}
          onCancel={() => { setPanel('none'); setSaveError(''); }}
          submitLabel="Save Section"
        />
      )}

      {panel === 'rules' && (
        <SectionRulesPanel
          section={section}
          availableCategories={availableCategories}
          availableDocTypes={availableDocTypes}
          onRulesChanged={(rules) => onUpdated({ ...section, rules })}
        />
      )}
    </div>
  );
}

// ─── SectionEditor ─────────────────────────────────────────────────────────

interface SectionEditorProps {
  templateId: string;
  initialSections: ConsultantTemplateSectionWithRules[];
  availableCategories?: Category[];
  availableDocTypes?: DocumentType[];
}

export function SectionEditor({ templateId, initialSections, availableCategories = [], availableDocTypes = [] }: SectionEditorProps) {
  const { token } = useAuth();
  const [sections, setSections] = useState<ConsultantTemplateSectionWithRules[]>(
    [...initialSections].sort((a, b) => a.section_order - b.section_order),
  );
  const [addingNew, setAddingNew] = useState(false);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [reorderError, setReorderError] = useState('');

  async function reorder(newOrder: ConsultantTemplateSectionWithRules[]) {
    setSections(newOrder);
    setReorderError('');
    if (!token) return;
    try {
      await api.templates.reorderSections(token, templateId, newOrder.map((s) => s.id));
    } catch {
      setReorderError('Failed to save new order. Please reload.');
    }
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...sections];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    reorder(updated);
  }

  function moveDown(index: number) {
    if (index === sections.length - 1) return;
    const updated = [...sections];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    reorder(updated);
  }

  async function handleDelete(section: ConsultantTemplateSectionWithRules) {
    if (!token) return;
    if (!confirm(`Delete section "${section.section_name}"?`)) return;
    try {
      await api.templates.deleteSection(token, section.id);
      setSections((prev) => prev.filter((s) => s.id !== section.id).map((s, i) => ({ ...s, section_order: i + 1 })));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete section.');
    }
  }

  function handleUpdated(updated: ConsultantTemplateSectionWithRules) {
    setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleAdd(values: SectionFormValues) {
    if (!values.section_name.trim()) { setAddError('Section name is required.'); return; }
    if (!token) return;
    setAddLoading(true);
    setAddError('');
    try {
      const created = await api.templates.addSection(token, templateId, {
        section_name: values.section_name.trim(),
        section_code: values.section_code.trim() || null,
        is_required: values.is_required,
        accepts_multiple_files: values.accepts_multiple_files,
        description: values.description.trim() || null,
      });
      setSections((prev) => [...prev, created]);
      setAddingNew(false);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to add section.');
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {reorderError && <Alert variant="warning">{reorderError}</Alert>}

      {sections.length === 0 && !addingNew && (
        <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
          No sections yet. Add your first section below.
        </div>
      )}

      {sections.map((section, index) => (
        <SectionRow
          key={section.id}
          section={section}
          isFirst={index === 0}
          isLast={index === sections.length - 1}
          availableCategories={availableCategories}
          availableDocTypes={availableDocTypes}
          onMoveUp={() => moveUp(index)}
          onMoveDown={() => moveDown(index)}
          onDelete={() => handleDelete(section)}
          onUpdated={handleUpdated}
        />
      ))}

      {addingNew ? (
        <InlineForm
          initial={EMPTY_SECTION}
          loading={addLoading}
          error={addError}
          onSave={handleAdd}
          onCancel={() => { setAddingNew(false); setAddError(''); }}
          submitLabel="Add Section"
        />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-3 text-sm text-slate-500 transition-colors hover:border-brand hover:text-brand"
        >
          <Plus className="h-4 w-4" />
          Add Section
        </button>
      )}
    </div>
  );
}
