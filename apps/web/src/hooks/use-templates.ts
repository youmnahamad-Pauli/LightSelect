'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { ConsultantTemplateListItem, ConsultantTemplateWithSections } from '@/types';

export function useTemplates() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<ConsultantTemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.templates.list(token);
      setTemplates(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return { templates, loading, error, reload: load };
}

export function useTemplateById(id: string) {
  const { token } = useAuth();
  const [data, setData] = useState<ConsultantTemplateWithSections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.templates.get(token, id);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
