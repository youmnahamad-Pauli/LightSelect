'use client';

import { useState } from 'react';
import { Plus, ListChecks, Sparkles, FilePlus, PenLine, DollarSign } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useBoqItems, usePriceLists } from '@/hooks/use-boq';
import { useSpecDocuments } from '@/hooks/use-spec';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BOQTable } from '@/components/boq/BOQTable';
import { PriceListManager } from '@/components/boq/PriceListManager';
import type { BoqItem, BoqSourceType } from '@/types';

// ─── Add BOQ item modal ────────────────────────────────────────────────────

type AddMode = 'spec' | 'manual';

interface AddBoqModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  specDocuments: { id: string; title: string; version_label: string; is_active: boolean }[];
  onCreated: (item: BoqItem) => void;
}

function AddBoqModal({ open, onClose, projectId, specDocuments, onCreated }: AddBoqModalProps) {
  const { token } = useAuth();
  const [mode, setMode] = useState<AddMode>('manual');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [specDocId, setSpecDocId] = useState(specDocuments.find((d) => d.is_active)?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!token || !description.trim()) { setError('Description is required.'); return; }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number.'); return; }
    setLoading(true);
    setError('');
    try {
      const item = await api.boq.create(token, projectId, {
        description: description.trim(),
        quantity: qty,
        unit,
        spec_document_id: mode === 'spec' ? specDocId || null : null,
        source_type: mode as BoqSourceType,
      });
      onCreated(item);
      onClose();
      setDescription('');
      setQuantity('1');
      setUnit('pcs');
      setMode('manual');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create BOQ item.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add BOQ Item"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={create} loading={loading}>Add Item</Button>
        </>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'manual', label: 'Manual entry', icon: PenLine, desc: 'Enter requirements manually' },
            { value: 'spec', label: 'From spec', icon: ListChecks, desc: 'Import from active spec doc' },
          ] as const).map(({ value, label, icon: Icon, desc }) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${mode === value ? 'border-primary bg-primary-soft/20' : 'border-border hover:bg-surface-hover'}`}
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${mode === value ? 'text-primary' : 'text-ink-faint'}`} />
              <div>
                <p className={`text-sm font-medium ${mode === value ? 'text-primary' : 'text-ink'}`}>{label}</p>
                <p className="text-xs text-ink-faint">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {mode === 'spec' && specDocuments.length > 0 && (
          <FormField label="Spec Document">
            <Select
              options={specDocuments.map((d) => ({
                value: d.id,
                label: `${d.title} (${d.version_label})${d.is_active ? ' — Active' : ''}`,
              }))}
              placeholder="Select spec document…"
              value={specDocId}
              onChange={(e) => setSpecDocId(e.target.value)}
            />
          </FormField>
        )}
        {mode === 'spec' && specDocuments.length === 0 && (
          <Alert variant="warning">No spec documents found. Add one in the Spec tab first.</Alert>
        )}

        <FormField label="Description" required>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Street Luminaire Type A"
            autoFocus
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quantity" required>
            <Input type="number" min="0.01" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
          <FormField label="Unit">
            <Select
              options={[
                { value: 'pcs', label: 'pcs' },
                { value: 'sets', label: 'sets' },
                { value: 'lot', label: 'lot' },
                { value: 'm', label: 'm (metres)' },
                { value: 'nr', label: 'nr (number)' },
              ]}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

// ─── BOQ page ──────────────────────────────────────────────────────────────

export default function ProjectBOQPage({ params }: { params: { id: string } }) {
  const { project } = useProjectContext();
  const { items, loading, addItem, updateItem, removeItem } = useBoqItems(params.id);
  const { priceLists, reload: reloadPriceLists } = usePriceLists(params.id);
  const { documents: specDocuments } = useSpecDocuments(params.id);
  const [addOpen, setAddOpen] = useState(false);
  const [priceListOpen, setPriceListOpen] = useState(false);

  const totalItems = items.length;
  const hasProducts = items.filter((i) => i.product_id).length;
  const totalValue = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const currency = items[0]?.currency ?? 'USD';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Bill of Quantities</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Build your lighting bill of quantities. Assign products, run spec compliance checks, and set pricing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPriceListOpen((v) => !v)}>
            <DollarSign className="h-3.5 w-3.5" />
            Price Lists
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Spec availability hint */}
      {specDocuments.length === 0 && (
        <Alert variant="info">
          No spec document added yet. BOQ items can still be created manually. Add a spec version in the{' '}
          <strong>Spec</strong> tab to auto-populate requirements per row.
        </Alert>
      )}

      {/* Summary bar */}
      {totalItems > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Line items', value: String(totalItems) },
            { label: 'Products assigned', value: `${hasProducts}/${totalItems}` },
            { label: 'Total value', value: totalValue > 0 ? `${currency} ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="py-3">
                <p className="text-xs text-ink-muted">{label}</p>
                <p className="text-lg font-bold text-ink mt-0.5">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Price lists panel */}
      {priceListOpen && (
        <Card>
          <CardContent className="pt-4">
            <PriceListManager projectId={params.id} priceLists={priceLists} onReload={reloadPriceLists} />
          </CardContent>
        </Card>
      )}

      {/* BOQ table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Items
            {totalItems > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-faint">{totalItems} row{totalItems !== 1 ? 's' : ''}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-surface-subtle animate-pulse" />
              ))}
            </div>
          ) : (
            <BOQTable
              items={items}
              priceLists={priceLists}
              onUpdated={updateItem}
              onDeleted={removeItem}
            />
          )}
        </CardContent>
      </Card>

      <AddBoqModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={params.id}
        specDocuments={specDocuments}
        onCreated={addItem}
      />
    </div>
  );
}
