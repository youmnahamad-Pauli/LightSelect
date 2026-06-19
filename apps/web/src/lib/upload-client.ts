/**
 * XHR-based file uploader with progress tracking.
 * fetch() does not expose upload progress; XHR does via xhr.upload.onprogress.
 */
import type { UploadedFile } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.doc,.docx';
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '50 MB';

export interface UploadOptions {
  token: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export function uploadFile(file: File, options: UploadOptions): Promise<UploadedFile> {
  const { token, onProgress, signal } = options;

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && body.success) {
          resolve(body.data as UploadedFile);
        } else {
          reject(new UploadError(body.error?.message ?? `Upload failed (${xhr.status})`, xhr.status));
        }
      } catch {
        reject(new UploadError('Invalid response from server'));
      }
    });

    xhr.addEventListener('error', () => reject(new UploadError('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new UploadError('Upload cancelled')));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(formData);
  });
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `"${file.name}" is too large. Maximum size is ${MAX_FILE_SIZE_LABEL}.`;
  }
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return `"${file.name}" has an unsupported file type (${file.type || 'unknown'}).`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
