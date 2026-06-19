'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Archive, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useAuth } from '@/context/auth-context';
import { useChecklist } from '@/hooks/use-checklist';
import { api, ApiError } from '@/lib/api-client';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectFormModal } from './ProjectFormModal';

export function ProjectHeader() {
  const { project, reload } = useProjectContext();
  const { token } = useAuth();
  const router = useRouter();
  const { checklist } = useChecklist(project.id);
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    if (!token) return;
    if (!confirm(`Archive "${project.project_name}"? It will no longer appear in your active projects.`)) return;
    setArchiving(true);
    try {
      await api.projects.archive(token, project.id);
      router.push('/projects');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to archive project.');
      setArchiving(false);
    }
  }

  const metaParts = [project.client_name, project.location, project.project_code].filter(Boolean);
  const isBlocked = checklist && !checklist.no_template && !checklist.is_export_ready;
  const isReady = checklist && !checklist.no_template && checklist.is_export_ready;

  return (
    <div className="border-b border-slate-200 bg-white px-6 pb-0 pt-4">
      <div className="mb-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-800"
        >
          <ChevronLeft className="h-3 w-3" />
          Projects
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-slate-900">{project.project_name}</h1>
            <Badge variant={statusBadgeVariant(project.status)}>{project.status}</Badge>
            {project.revision_label && (
              <span className="text-sm text-slate-500">{project.revision_label}</span>
            )}
            {/* Export readiness indicator */}
            {isBlocked && (
              <Link href={`/projects/${project.id}/checklist`}>
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
                  <AlertTriangle className="h-3 w-3" />
                  Export blocked
                </span>
              </Link>
            )}
            {isReady && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3 w-3" />
                Export ready
              </span>
            )}
          </div>

          {metaParts.length > 0 && (
            <p className="mt-0.5 text-sm text-slate-500">{metaParts.join(' · ')}</p>
          )}
          {project.consultant_name && (
            <p className="text-sm text-slate-500">Consultant: {project.consultant_name}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          {project.status !== 'archived' && (
            <Button variant="ghost" size="sm" onClick={handleArchive} loading={archiving}>
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>
          )}
        </div>
      </div>

      <ProjectFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
        onSuccess={reload}
      />
    </div>
  );
}
