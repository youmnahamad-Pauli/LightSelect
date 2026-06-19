'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { ChecklistResult } from '@/types';

export function useChecklist(projectId: string) {
  const { token } = useAuth();
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      setChecklist(await api.checklist.get(token, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => { load(); }, [load]);

  return { checklist, loading, error, reload: load };
}
