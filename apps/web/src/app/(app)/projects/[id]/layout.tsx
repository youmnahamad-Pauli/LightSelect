'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectById } from '@/hooks/use-projects';
import { ProjectContext } from '@/context/project-context';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { ProjectTabNav } from '@/components/projects/ProjectTabNav';

export default function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { project, loading, error, reload } = useProjectById(params.id);
  const router = useRouter();

  useEffect(() => {
    if (error) router.replace('/projects');
  }, [error, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <ProjectContext.Provider value={{ project, reload }}>
      {/* -m-6 cancels the p-6 from (app)/layout.tsx main so header stretches edge-to-edge */}
      <div className="-m-6 flex min-h-full flex-col">
        <ProjectHeader />
        <ProjectTabNav id={params.id} />
        <div className="flex-1 p-6">{children}</div>
      </div>
    </ProjectContext.Provider>
  );
}
