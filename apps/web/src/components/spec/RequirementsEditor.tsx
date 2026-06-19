'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { SpecRequirement, RequirementPriority, RequirementOperator, RequirementStatus } from '@/types';

// ─── Helpers ───────────────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<RequirementOperator, string> = {
  eq: '= (equals)',
  gte: '≥ (at least)',
  lte: '≤ (at most)',
  gt: '> (greater than)',
  lt: '< (less than)',
  contains: 'contains',
  range: 'range',
  any: 'any value',
};

const OPERATOR_DISPLAY: Record<RequirementOperator, string> = {
  eq: '=', gte: '≥', lte: '≤', gt: '>', lt: '<', contains: '⊃', range: '..', any: '∗',
};

function priorityVariant(p: RequirementPriority) {
  if (p === 'mandatory') return 'danger' as const;
  if (p === 'preferred') return 'warning' as const;
  return 'neutral' as const;
}

function statusVariant(s: RequirementStatus) {
  if (s === 'reviewed') return 'success' as const;
  if (s === 'manual') return 'info' as const;
  return 'neutral' as const;
}

// ─── Inline edit row ───────────────────────────────────────────────────────

interface EditRowProps {
  req: SpecRequirement;
  onSaved: (updated: SpecRequirement) => void;
  onCancel: () => void;
}

function EditRow({ req, onSaved, onCancel }: EditRowProps) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    attribute_label: req.attribute_label,
    operator: req.operator,
    target_value: req.target_value,
    target_unit: req.target_unit ?? '',
    priority: req.priority,
    status: 'reviewed' as RequirementStatus,
    notes: req.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.spec.updateRequirement(token, req.id, {
        attribute_label: form.attribute_label,
        operator: form.operator as RequirementOperator,
        target_value: form.target_value,
        target_unit: form.target_unit || null,
        priority: form.priority as RequirementPriority,
        status: form.status,
        notes: form.notes || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-primary-soft/20">
      <td className="px-3 py-2">
        <Input
          value={form.attribute_label}
          onChange={(e) => setForm((p) => ({ ...p, attribute_label: e.target.value }))}
          className="h-7 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <Select
          options={Object.entries(OPERATOR_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          value={form.operator}
          onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value as RequirementOperator }))}
          className="h-7 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1.5">
          <Input
            value={form.target_value}
            onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))}
            placeholder="value"
            className="h-7 text-xs"
          />
          <Input
            value={form.target_unit}
            onChange={(e) => setForm((p) => ({ ...p, target_unit: e.target.value }))}
            placeholder="unit"
            className="h-7 text-xs w-16"
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <Select
          options={[
            { value: 'mandatory', label: 'Mandatory' },
            { value: 'preferred', label: 'Preferred' },
            { value: 'optional', label: 'Optional' },
          ]}
          value={form.priority}
          onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as RequirementPriority }))}
          className="h-7 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={save} disabled={saving} className="rounded p-1 text-success hover:bg-success-soft">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={onCancel} className="rounded p-1 text-ink-faint hover:bg-surface-hover">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
      </td>
    </tr>
  );
}

// ─── RequirementsEditor ────────────────────────────────────────────────────

interface RequirementsEditorProps {
  specDocumentId: string;
  requirements: SpecRequirement[];
  onUpdated: (reqs: SpecRequirement[]) => void;
}

export function RequirementsEditor({ specDocumentId, requirements, onUpdated }: RequirementsEditorProps) {
  const { token } = useAuth();
  const [reqs, setReqs] = useState<SpecRequirement[]>(requirements);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({
    attribute_key: '',
    attribute_label: '',
    operator: 'gte' as RequirementOperator,
    target_value: '',
    target_unit: '',
    priority: 'mandatory' as RequirementPriority,
  });
  const [addError, setAddError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  function handleUpdated(updated: SpecRequirement) {
    const next = reqs.map((r) => (r.id === updated.id ? updated : r));
    setReqs(next);
    onUpdated(next);
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm('Remove this requirement?')) return;
    setDeleting(id);
    try {
      await api.spec.deleteRequirement(token, id);
      const next = reqs.filter((r) => r.id !== id);
      setReqs(next);
      onUpdated(next);
    } catch {
      // silently ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleAdd() {
    if (!token || !newForm.attribute_key.trim() || !newForm.attribute_label.trim() || !newForm.target_value.trim()) {
      setAddError('Key, label, and value are required.');
      return;
    }
    setAddError('');
    try {
      const created = await api.spec.addRequirement(token, specDocumentId, {
        attribute_key: newForm.attribute_key.trim(),
        attribute_label: newForm.attribute_label.trim(),
        operator: newForm.operator,
        target_value: newForm.target_value.trim(),
        target_unit: newForm.target_unit.trim() || null,
        priority: newForm.priority,
      } as any);
      const next = [...reqs, created];
      setReqs(next);
      onUpdated(next);
      setAddingNew(false);
      setNewForm({ attribute_key: '', attribute_label: '', operator: 'gte', target_value: '', target_unit: '', priority: 'mandatory' });
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Failed to add requirement.');
    }
  }

  // Group by requirement_group
  const grouped = reqs.reduce<Record<string, SpecRequirement[]>>((acc, r) => {
    const g = r.requirement_group ?? 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(r);
    return acc;
  }, {});

  if (reqs.length === 0 && !addingNew) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm text-ink-faint">No requirements yet.</p>
          <p className="text-xs text-ink-faint mt-1">Click Extract to parse requirements from the spec document, or add them manually.</p>
        </div>
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          Add requirement manually
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([group, groupReqs]) => (
        <div key={group}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">{group}</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint">Attribute</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint w-24">Operator</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint">Value</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint w-28">Priority</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint w-28">Status</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {groupReqs.map((req) =>
                  editingId === req.id ? (
                    <EditRow
                      key={req.id}
                      req={req}
                      onSaved={handleUpdated}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={req.id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-sm font-medium text-ink">{req.attribute_label}</span>
                        {req.source_reference && (
                          <p className="text-xs text-ink-faint">{req.source_reference}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-sm text-ink-muted font-mono">
                          {OPERATOR_DISPLAY[req.operator]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-sm text-ink font-medium">
                          {req.target_value}
                          {req.target_unit && <span className="ml-1 text-ink-faint">{req.target_unit}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={priorityVariant(req.priority)}>{req.priority}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setEditingId(req.id)}
                            className="rounded p-1 text-ink-faint hover:bg-surface-hover hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(req.id)}
                            disabled={deleting === req.id}
                            className="rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Add new requirement */}
      {addingNew ? (
        <div className="rounded-xl border border-border p-4 bg-surface-subtle space-y-3">
          <p className="text-xs font-semibold text-ink-muted">Add requirement manually</p>
          {addError && <Alert variant="error">{addError}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-ink-muted">Attribute key</label>
              <Input value={newForm.attribute_key} onChange={(e) => setNewForm((p) => ({ ...p, attribute_key: e.target.value }))} placeholder="e.g. ip_rating" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-muted">Label</label>
              <Input value={newForm.attribute_label} onChange={(e) => setNewForm((p) => ({ ...p, attribute_label: e.target.value }))} placeholder="e.g. IP Rating" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-muted">Operator</label>
              <Select options={Object.entries(OPERATOR_LABELS).map(([v, l]) => ({ value: v, label: l }))} value={newForm.operator} onChange={(e) => setNewForm((p) => ({ ...p, operator: e.target.value as RequirementOperator }))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-muted">Value</label>
              <div className="flex gap-1.5">
                <Input value={newForm.target_value} onChange={(e) => setNewForm((p) => ({ ...p, target_value: e.target.value }))} placeholder="e.g. IP65" className="h-8 text-xs flex-1" />
                <Input value={newForm.target_unit} onChange={(e) => setNewForm((p) => ({ ...p, target_unit: e.target.value }))} placeholder="unit" className="h-8 text-xs w-16" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Select
              options={[{ value: 'mandatory', label: 'Mandatory' }, { value: 'preferred', label: 'Preferred' }, { value: 'optional', label: 'Optional' }]}
              value={newForm.priority}
              onChange={(e) => setNewForm((p) => ({ ...p, priority: e.target.value as RequirementPriority }))}
              className="h-8 text-xs w-36"
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAddingNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd}>Add</Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          Add requirement manually
        </button>
      )}
    </div>
  );
}
