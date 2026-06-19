'use client';

import { useState, useRef } from 'react';
import { Upload, Trash2, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { formatDate } from '@/lib/utils';
import type { PriceList } from '@/types';

interface PriceListManagerProps {
  projectId: string;
  priceLists: PriceList[];
  onReload: () => void;
}

export function PriceListManager({ projectId, priceLists, onReload }: PriceListManagerProps) {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVendor, setNewVendor] = useState('');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ id: string; count: number } | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  async function createList() {
    if (!token || !newName.trim()) return;
    setError('');
    try {
      await api.priceLists.create(token, projectId, {
        name: newName.trim(),
        vendor_name: newVendor.trim() || null,
      });
      onReload();
      setNewName('');
      setNewVendor('');
      setCreating(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create price list.');
    }
  }

  async function handleFileUpload(priceListId: string, file: File) {
    if (!token) return;
    setUploadingFor(priceListId);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/price-lists/${priceListId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error?.message ?? 'Upload failed');
      setUploadResult({ id: priceListId, count: body.data.imported_count });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingFor(null);
    }
  }

  async function deleteList(id: string) {
    if (!token) return;
    if (!confirm('Delete this price list?')) return;
    setDeleting(id);
    try {
      await api.priceLists.delete(token, id);
      onReload();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Price Lists</p>
        <Button size="sm" variant="secondary" onClick={() => setCreating((v) => !v)}>
          + Add
        </Button>
      </div>

      {error && <Alert variant="error" onDismiss={() => setError('')}>{error}</Alert>}
      {uploadResult && (
        <Alert variant="success" onDismiss={() => setUploadResult(null)}>
          <CheckCircle2 className="h-4 w-4 inline mr-1" />
          Imported {uploadResult.count} items.
        </Alert>
      )}

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-border bg-surface-subtle p-4 space-y-3">
          <FormField label="Name">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Signify Q1 2025" autoFocus />
          </FormField>
          <FormField label="Vendor (optional)">
            <Input value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="e.g. Signify" />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            <Button size="sm" onClick={createList} disabled={!newName.trim()}>Create</Button>
          </div>
        </div>
      )}

      {/* List */}
      {priceLists.length === 0 && !creating && (
        <p className="text-sm text-ink-faint">No price lists yet. Create one and upload a CSV to enable auto-pricing.</p>
      )}

      {priceLists.map((pl) => (
        <div key={pl.id} className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-ink">{pl.name}</span>
                {pl.vendor_name && <span className="text-xs text-ink-faint">{pl.vendor_name}</span>}
                <Badge variant="neutral">{pl.currency}</Badge>
              </div>
              <p className="text-xs text-ink-faint mt-0.5">Updated {formatDate(pl.updated_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(pl.id, f);
                    e.target.value = '';
                  }}
                />
                <span className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-hover cursor-pointer transition-colors ${uploadingFor === pl.id ? 'opacity-50' : ''}`}>
                  <Upload className="h-3 w-3" />
                  Upload CSV
                </span>
              </label>
              <button
                onClick={() => deleteList(pl.id)}
                disabled={deleting === pl.id}
                className="rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      <p className="text-xs text-ink-faint">
        CSV format: <code className="bg-surface-subtle px-1 rounded">model_code, description, unit_price, currency</code>
      </p>
    </div>
  );
}
