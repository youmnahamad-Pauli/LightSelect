'use client';

import { createContext, useContext } from 'react';
import type { Project } from '@/types';

interface ProjectContextValue {
  project: Project;
  reload: () => void;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used inside the project workspace layout');
  return ctx;
}
