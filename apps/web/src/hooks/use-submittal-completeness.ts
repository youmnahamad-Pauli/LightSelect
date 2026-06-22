'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { SubmittalCompletenessResult } from '@/types';

export function useSubmittalCompleteness(projectId: string) {
  const { token } = useAuth();
  const [completeness, setCompleteness] = useState<SubmittalCompletenessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      setCompleteness(await api.submittalCompleteness.get(token, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load submittal completeness');
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => { load(); }, [load]);

  return { completeness, loading, error, reload: load };
}
