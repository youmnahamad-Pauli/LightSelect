'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { DocumentType } from '@/types';

export function useDocumentTypes() {
  const { token } = useAuth();
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setDocumentTypes(await api.documentTypes.list(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load document types');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return { documentTypes, loading, error, reload: load };
}
