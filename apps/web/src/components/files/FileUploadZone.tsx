'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Upload, CheckCircle2, XCircle, RefreshCw, X, FileText } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import {
  uploadFile,
  validateFile,
  formatFileSize,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_LABEL,
  UploadError,
} from '@/lib/upload-client';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn } from '@/lib/utils';
import type { UploadedFile, UploadQueueItem } from '@/types';

interface FileUploadZoneProps {
  /** Called for each successfully uploaded file. */
  onUploaded?: (file: UploadedFile) => void;
  /** Optional label shown above the zone. */
  label?: string;
  /** If true, collapse to a compact inline variant (for embedding in larger forms). */
  compact?: boolean;
}

function fileIcon(mime: string | undefined) {
  return <FileText className="h-4 w-4 shrink-0 text-slate-400" />;
}

export function FileUploadZone({ onUploaded, label, compact = false }: FileUploadZoneProps) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);

  function updateItem(key: string, patch: Partial<UploadQueueItem>) {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const processFiles = useCallback(
    async (rawFiles: FileList | File[]) => {
      if (!token) return;
      const incoming = Array.from(rawFiles);

      // Validate first — add all items as queued or failed immediately
      const items: UploadQueueItem[] = incoming.map((file) => {
        const validationError = validateFile(file);
        return {
          key: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          status: validationError ? 'failed' : 'queued',
          progress: 0,
          error: validationError ?? undefined,
        };
      });

      setQueue((prev) => [...prev, ...items]);

      // Upload valid items
      for (const item of items) {
        if (item.status === 'failed') continue;

        updateItem(item.key, { status: 'uploading', progress: 0 });

        try {
          const result = await uploadFile(item.file, {
            token,
            onProgress: (pct) => updateItem(item.key, { progress: pct }),
          });
          updateItem(item.key, { status: 'done', progress: 100, result });
          onUploaded?.(result);
        } catch (err) {
          const message =
            err instanceof UploadError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Upload failed';
          updateItem(item.key, { status: 'failed', error: message });
        }
      }
    },
    [token, onUploaded],
  );

  async function retryItem(item: UploadQueueItem) {
    if (!token) return;
    updateItem(item.key, { status: 'uploading', progress: 0, error: undefined });
    try {
      const result = await uploadFile(item.file, {
        token,
        onProgress: (pct) => updateItem(item.key, { progress: pct }),
      });
      updateItem(item.key, { status: 'done', progress: 100, result });
      onUploaded?.(result);
    } catch (err) {
      const message = err instanceof UploadError ? err.message : 'Upload failed';
      updateItem(item.key, { status: 'failed', error: message });
    }
  }

  function removeItem(key: string) {
    setQueue((prev) => prev.filter((i) => i.key !== key));
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  }

  const hasItems = queue.length > 0;
  const activeUploads = queue.filter((i) => i.status === 'uploading').length;

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-ink-muted">{label}</p>}

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
          compact ? 'py-5' : 'py-10',
          dragOver
            ? 'border-primary bg-primary-soft/30'
            : 'border-border bg-surface-subtle hover:border-primary hover:bg-primary-soft/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={onInputChange}
          className="sr-only"
          aria-label="Upload files"
        />
        <Upload
          className={cn(
            'mb-2 h-7 w-7 transition-colors',
            dragOver ? 'text-primary' : 'text-ink-faint group-hover:text-primary',
          )}
        />
        <p className="text-sm font-medium text-ink">
          {dragOver ? 'Drop files here' : 'Drag files here or click to browse'}
        </p>
        {!compact && (
          <p className="mt-1 text-xs text-ink-faint">
            PDF, Word, Excel, CSV, images · max {MAX_FILE_SIZE_LABEL} per file
          </p>
        )}
        {activeUploads > 0 && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 text-xs text-primary">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            Uploading {activeUploads}…
          </div>
        )}
      </div>

      {/* Upload queue */}
      {hasItems && (
        <div className="space-y-1.5">
          {queue.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              {fileIcon(item.result?.mime_type ?? undefined)}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {item.file.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatFileSize(item.file.size)}
                  </span>
                </div>

                {item.status === 'uploading' && (
                  <ProgressBar value={item.progress} showLabel size="sm" />
                )}

                {item.status === 'done' && (
                  <p className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Uploaded successfully
                  </p>
                )}

                {item.status === 'failed' && (
                  <p className="flex items-center gap-1 text-xs text-danger">
                    <XCircle className="h-3.5 w-3.5" />
                    {item.error ?? 'Upload failed'}
                  </p>
                )}

                {item.status === 'queued' && (
                  <p className="text-xs text-ink-faint">Queued…</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {item.status === 'failed' && !item.error?.includes('unsupported') && !item.error?.includes('large') && (
                  <button
                    onClick={() => retryItem(item)}
                    className="rounded p-1 text-ink-faint hover:text-primary"
                    title="Retry upload"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
                {(item.status === 'done' || item.status === 'failed') && (
                  <button
                    onClick={() => removeItem(item.key)}
                    className="rounded p-1 text-slate-400 hover:text-slate-600"
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
