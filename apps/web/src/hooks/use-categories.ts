'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { Category, CategoryDetail } from '@/types';

export function useCategories() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setCategories(await api.categories.list(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, error, reload: load };
}

export function useCategoryById(id: string) {
  const { token } = useAuth();
  const [category, setCategory] = useState<CategoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      setCategory(await api.categories.get(token, id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load category');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  return { category, loading, error, reload: load };
}
