'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type { ExtractionJob } from '@/types';

export function useExtractionJobs(projectFileId: string | null) {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !projectFileId) return;
    setLoading(true);
    try {
      setJobs(await api.extraction.listJobs(token, projectFileId));
    } catch {
      // Silently ignore — non-critical
    } finally {
      setLoading(false);
    }
  }, [token, projectFileId]);

  useEffect(() => {
    load();
  }, [load]);

  function addJob(job: ExtractionJob) {
    setJobs((prev) => [job, ...prev]);
  }

  function updateJob(job: ExtractionJob) {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
  }

  return { jobs, loading, reload: load, addJob, updateJob };
}
