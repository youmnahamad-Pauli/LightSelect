'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, Trash2, Tag, Play, CheckCircle, AlertCircle, File } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import type { ProjectDocument, ProjectDocumentType, SpecParseResult } from '@/types';
import { PROJECT_DOCUMENT_TYPE_LABELS } from '@/types';

const DOC_TYPES: ProjectDocumentType[] = [
  'spec', 'boq', 'drawing_dwg', 'submittal_template',
  'test_certificate', 'datasheet', 'trade_licence', 'other',
];

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function docTypeBadgeColor(type: ProjectDocumentType): string {
  const colors: Record<ProjectDocumentType, string> = {
    spec:               'bg-blue-100 text-blue-700',
    boq:                'bg-purple-100 text-purple-700',
    drawing_dwg:        'bg-orange-100 text-orange-700',
    submittal_template: 'bg-teal-100 text-teal-700',
    test_certificate:   'bg-green-100 text-green-700',
    datasheet:          'bg-slate-100 text-slate-700',
    trade_licence:      'bg-yellow-100 text-yellow-700',
    other:              'bg-slate-100 text-slate-500',
  };
  return colors[type] ?? 'bg-slate-100 text-slate-500';
}

export default function ProjectDocumentsPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<SpecParseResult | null>(null);
  const [parsing, setParsing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.projectDocuments.list(token, params.id);
      setDocs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !token) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const doc = await api.projectDocuments.upload(token, params.id, fd);
        setDocs((prev) => [doc, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleClassify(docId: string, type: ProjectDocumentType) {
    if (!token) return;
    setClassifyingId(docId);
    try {
      const updated = await api.projectDocuments.classify(token, docId, type);
      setDocs((prev) => prev.map((d) => (d.id === docId ? updated : d)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Classify failed');
    } finally {
      setClassifyingId(null);
    }
  }

  async function handleDelete(docId: string) {
    if (!token) return;
    try {
      await api.projectDocuments.delete(token, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  async function handleParseSpec(doc: ProjectDocument) {
    if (!token) return;
    setParsing(doc.id);
    setParseResult(null);
    setError(null);
    try {
      const result = await api.projectDocuments.parseSpec(token, params.id, doc.id);
      setParseResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Parse failed');
    } finally {
      setParsing(null);
    }
  }

  const grouped = DOC_TYPES.reduce<Record<string, ProjectDocument[]>>((acc, t) => {
    acc[t] = docs.filter((d) => d.document_type === t);
    return acc;
  }, {} as Record<string, ProjectDocument[]>);

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Upload className="h-4 w-4 text-brand" />
            Upload Documents
          </CardTitle>
          <p className="text-xs text-slate-500">
            PDF, Word, Excel, images, and DWG files are accepted. DWGs are stored as drawings and
            not processed.
          </p>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp,.dwg"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="secondary"
          >
            {uploading ? 'Uploading…' : 'Choose files'}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto text-red-500 hover:text-red-700" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Parse result */}
      {parseResult && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          <div>
            <p className="font-medium">
              Spec parsed: {parseResult.items_written} requirement{parseResult.items_written !== 1 ? 's' : ''} written
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {parseResult.items_detected} items detected · {parseResult.llm_meta.elapsed_ms}ms
            </p>
          </div>
          <button className="ml-auto text-emerald-500 hover:text-emerald-700" onClick={() => setParseResult(null)}>✕</button>
        </div>
      )}

      {/* Document list by type */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 py-16 text-center">
          <File className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No documents uploaded yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Upload a spec PDF to parse it into the item schedule.
          </p>
        </div>
      ) : (
        DOC_TYPES.filter((t) => grouped[t].length > 0).map((type) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${docTypeBadgeColor(type)}`}
                >
                  {PROJECT_DOCUMENT_TYPE_LABELS[type]}
                </span>
                <span className="text-sm font-normal text-slate-500 ml-2">
                  {grouped[type].length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-100">
                {grouped[type].map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {doc.original_filename}
                      </p>
                      <p className="text-xs text-slate-400">{formatBytes(doc.file_size_bytes)}</p>
                    </div>

                    {/* Reclassify */}
                    <div className="w-44 shrink-0">
                      <select
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        value={doc.document_type}
                        disabled={classifyingId === doc.id}
                        onChange={(e) =>
                          handleClassify(doc.id, e.target.value as ProjectDocumentType)
                        }
                      >
                        {DOC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {PROJECT_DOCUMENT_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Parse spec action (PDF spec only) */}
                    {doc.document_type === 'spec' && doc.mime_type === 'application/pdf' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={parsing === doc.id}
                        onClick={() => handleParseSpec(doc)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {parsing === doc.id ? 'Parsing…' : 'Parse spec'}
                      </Button>
                    )}

                    {/* Delete */}
                    <button
                      className="p-1 text-slate-400 hover:text-red-500"
                      onClick={() => handleDelete(doc.id)}
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
