'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

const columns: Column<Project>[] = [
  {
    key: 'project_name',
    header: 'Project',
    render: (r) => <span className="font-medium text-slate-900">{r.project_name}</span>,
  },
  {
    key: 'client_name',
    header: 'Client',
    render: (r) => r.client_name ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'location',
    header: 'Location',
    render: (r) => r.location ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'revision_label',
    header: 'Revision',
    render: (r) => r.revision_label ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>,
  },
  {
    key: 'updated_at',
    header: 'Last Updated',
    render: (r) => <span className="text-slate-500">{formatDate(r.updated_at)}</span>,
  },
];

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, loading, reload } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage your lighting submittal projects.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <Card>
        <DataTable<Project>
          columns={columns}
          rows={projects.filter((p) => p.status !== 'archived')}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={(r) => router.push(`/projects/${r.id}/overview`)}
          empty="No projects yet. Create your first project to get started."
        />
      </Card>

      <ProjectFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={reload}
      />
    </div>
  );
}
