'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { MappedProjectFile } from '@/types';

export function useProjectFiles(projectId: string) {
  const { token } = useAuth();
  const [projectFiles, setProjectFiles] = useState<MappedProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      setProjectFiles(await api.projectFiles.list(token, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load project files');
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function addProjectFile(pf: MappedProjectFile) {
    setProjectFiles((prev) => [...prev, pf]);
  }

  function updateProjectFile(pf: MappedProjectFile) {
    setProjectFiles((prev) => prev.map((f) => (f.id === pf.id ? pf : f)));
  }

  function removeProjectFile(id: string) {
    setProjectFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return { projectFiles, loading, error, reload: load, addProjectFile, updateProjectFile, removeProjectFile };
}
