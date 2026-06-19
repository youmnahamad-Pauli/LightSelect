'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { BoqItem, PriceList } from '@/types';

export function useBoqItems(projectId: string) {
  const { token } = useAuth();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await api.boq.list(token, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load BOQ');
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => { load(); }, [load]);

  function addItem(item: BoqItem) {
    setItems((prev) => [...prev, item]);
  }

  function updateItem(item: BoqItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return { items, loading, error, reload: load, addItem, updateItem, removeItem };
}

export function usePriceLists(projectId: string) {
  const { token } = useAuth();
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      setPriceLists(await api.priceLists.list(token, projectId));
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => { load(); }, [load]);

  return { priceLists, loading, reload: load };
}
