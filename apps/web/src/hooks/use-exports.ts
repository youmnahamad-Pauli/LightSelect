'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { ExportPackage } from '@/types';

export function useExports(projectId: string) {
  const { token } = useAuth();
  const [exports, setExports] = useState<ExportPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      setExports(await api.exports.list(token, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load export history');
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => { load(); }, [load]);

  function addExport(pkg: ExportPackage) {
    setExports((prev) => [pkg, ...prev]);
  }

  return { exports, loading, error, reload: load, addExport };
}
