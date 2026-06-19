'use client';

import { useState } from 'react';
import { Pencil, Trash2, FileText } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { formatFileSize } from '@/lib/upload-client';
import type { MappedProjectFile, ProjectFileRequiredStatus, UploadedFile } from '@/types';
import { FileMappingWizard } from './FileMappingWizard';

function requiredStatusVariant(status: ProjectFileRequiredStatus) {
  switch (status) {
    case 'required':  return 'danger' as const;
    case 'optional':  return 'neutral' as const;
    case 'reference': return 'info' as const;
  }
}

interface MappedFileListProps {
  projectFiles: MappedProjectFile[];
  projectId: string;
  templateId: string | null;
  loading?: boolean;
  onUpdated: (pf: MappedProjectFile) => void;
  onRemoved: (id: string) => void;
}

export function MappedFileList({
  projectFiles,
  projectId,
  templateId,
  loading,
  onUpdated,
  onRemoved,
}: MappedFileListProps) {
  const { token } = useAuth();
  const [removing, setRemoving] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<MappedProjectFile | null>(null);

  async function handleRemove(pf: MappedProjectFile) {
    if (!token) return;
    if (!confirm(`Remove "${pf.file_name}" from this project?`)) return;
    setRemoving(pf.id);
    try {
      await api.projectFiles.remove(token, pf.id);
      onRemoved(pf.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to remove file.');
    } finally {
      setRemoving(null);
    }
  }

  // Build a synthetic UploadedFile for the wizard edit mode (only needs id + name)
  const editFileProxy = editTarget
    ? ({
        id: editTarget.file_id,
        original_file_name: editTarget.file_name,
        mime_type: editTarget.mime_type,
        mime_label: editTarget.mime_type?.includes('pdf') ? 'PDF' : 'Document',
        file_size_bytes: editTarget.file_size_bytes,
        upload_status: 'uploaded',
        download_url: null,
        organization_id: '',
        uploaded_by: '',
        stored_file_name: editTarget.file_name,
        checksum: null,
        created_at: editTarget.created_at,
        updated_at: editTarget.updated_at,
      } as UploadedFile)
    : null;

  const columns: Column<MappedProjectFile>[] = [
    {
      key: 'file',
      header: 'File',
      render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-medium text-slate-900 max-w-xs">{r.file_name}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-sm text-slate-700">{r.category_name}</span>,
    },
    {
      key: 'doc_type',
      header: 'Type',
      render: (r) => (
        <span className="text-sm text-slate-700">
          {r.document_type_name}
          {r.document_type_code && (
            <code className="ml-1 text-xs text-slate-400">{r.document_type_code}</code>
          )}
        </span>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-slate-700">{r.section_name}</span>
          {r.section_is_required && (
            <Badge variant="danger" className="w-fit text-xs">Required</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (r) => (
        <Badge variant={requiredStatusVariant(r.required_status)}>{r.required_status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setEditTarget(r)}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Edit mapping"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleRemove(r)}
            disabled={removing === r.id}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            title="Remove from project"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable<MappedProjectFile>
        columns={columns}
        rows={projectFiles}
        rowKey={(r) => r.id}
        loading={loading}
        empty="No files assigned to this project yet. Upload files and use the Assign button to map them here."
      />

      {editTarget && editFileProxy && (
        <FileMappingWizard
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          file={editFileProxy}
          projectId={projectId}
          templateId={templateId}
          projectFileId={editTarget.id}
          initialValues={{
            category_id: editTarget.category_id,
            document_type_id: editTarget.document_type_id,
            consultant_template_section_id: editTarget.consultant_template_section_id,
            required_status: editTarget.required_status,
            notes: editTarget.notes ?? '',
          }}
          onSuccess={(updated) => {
            onUpdated(updated);
            setEditTarget(null);
          }}
        />
      )}
    </>
  );
}
