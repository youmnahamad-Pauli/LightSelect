'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { UploadedFile } from '@/types';

export function useOrgFiles() {
  const { token } = useAuth();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setFiles(await api.files.list(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function addFile(file: UploadedFile) {
    setFiles((prev) => [file, ...prev]);
  }

  async function deleteFile(id: string) {
    if (!token) return;
    await api.files.delete(token, id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return { files, loading, error, reload: load, addFile, deleteFile };
}
