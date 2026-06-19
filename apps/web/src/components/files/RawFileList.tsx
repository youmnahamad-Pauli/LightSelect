'use client';

import { useState } from 'react';
import { Trash2, Download, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { formatFileSize } from '@/lib/upload-client';
import { formatDate } from '@/lib/utils';
import type { UploadedFile } from '@/types';

function statusVariant(status: UploadedFile['upload_status']) {
  switch (status) {
    case 'uploaded': return 'success' as const;
    case 'failed':   return 'danger' as const;
    case 'pending':  return 'neutral' as const;
  }
}

function MimeChip({ label }: { label: string }) {
  return (
    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
      {label}
    </span>
  );
}

interface RawFileListProps {
  files: UploadedFile[];
  loading?: boolean;
  onDeleted?: (id: string) => void;
  /**
   * When provided, shows an "Assign" button per row.
   * Called with the file — used in Priority 6 mapping wizard.
   */
  onAssign?: (file: UploadedFile) => void;
  /** Optional label shown above the table */
  title?: string;
  emptyMessage?: string;
}

export function RawFileList({
  files,
  loading,
  onDeleted,
  onAssign,
  title,
  emptyMessage,
}: RawFileListProps) {
  const { token } = useAuth();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(file: UploadedFile) {
    if (!token) return;
    if (!confirm(`Delete "${file.original_file_name}"? This cannot be undone.`)) return;
    setDeleting(file.id);
    try {
      await api.files.delete(token, file.id);
      onDeleted?.(file.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete file.');
    } finally {
      setDeleting(null);
    }
  }

  const columns: Column<UploadedFile>[] = [
    {
      key: 'name',
      header: 'File',
      render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <MimeChip label={r.mime_label} />
          <span className="truncate text-sm font-medium text-slate-900 max-w-xs">
            {r.original_file_name}
          </span>
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      width: '90px',
      render: (r) => (
        <span className="text-sm text-slate-500">
          {r.file_size_bytes ? formatFileSize(r.file_size_bytes) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (r) => (
        <Badge variant={statusVariant(r.upload_status)}>{r.upload_status}</Badge>
      ),
    },
    {
      key: 'uploaded_at',
      header: 'Uploaded',
      width: '120px',
      render: (r) => (
        <span className="text-sm text-slate-500">{formatDate(r.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: onAssign ? '120px' : '72px',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {r.download_url && r.upload_status === 'uploaded' && (
            <a
              href={r.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          {onAssign && r.upload_status === 'uploaded' && (
            <button
              onClick={() => onAssign(r)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10"
              title="Assign to project"
            >
              Assign
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
          {onDeleted && (
            <button
              onClick={() => handleDelete(r)}
              disabled={deleting === r.id}
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      {title && (
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      )}
      <DataTable<UploadedFile>
        columns={columns}
        rows={files}
        rowKey={(r) => r.id}
        loading={loading}
        empty={emptyMessage ?? 'No files uploaded yet.'}
      />
    </div>
  );
}
