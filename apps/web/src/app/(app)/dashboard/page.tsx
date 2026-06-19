'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderOpen, Tag, FileText, Package } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

const recentColumns: Column<Project>[] = [
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
    key: 'status',
    header: 'Status',
    render: (r) => <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>,
  },
  {
    key: 'updated_at',
    header: 'Updated',
    render: (r) => <span className="text-slate-500">{formatDate(r.updated_at)}</span>,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { projects, loading, reload } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);

  const active = projects.filter((p) => p.status === 'active');
  const draft = projects.filter((p) => p.status === 'draft');
  const recent = projects.filter((p) => p.status !== 'archived').slice(0, 5);

  const stats = [
    { label: 'Projects', value: projects.filter((p) => p.status !== 'archived').length, icon: FolderOpen, color: 'text-brand' },
    { label: 'Active', value: active.length, icon: FolderOpen, color: 'text-emerald-600' },
    { label: 'Templates', value: '—', icon: FileText, color: 'text-amber-600' },
    { label: 'Exports', value: '—', icon: Package, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Welcome to LightSelect.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className={`rounded-lg bg-slate-100 p-2.5 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-slate-900">{loading ? '—' : value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent projects + quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Projects</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
              View all
            </Button>
          </CardHeader>
          <DataTable<Project>
            columns={recentColumns}
            rows={recent}
            rowKey={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/projects/${r.id}/overview`)}
            empty="No projects yet. Create your first project to get started."
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button
              onClick={() => setModalOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Plus className="h-4 w-4 text-brand" />
              Create new project
            </button>
            <button
              onClick={() => router.push('/templates')}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <FileText className="h-4 w-4 text-amber-500" />
              Set up consultant template
            </button>
            <button
              onClick={() => router.push('/categories')}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Tag className="h-4 w-4 text-emerald-500" />
              Add categories
            </button>
          </CardContent>
        </Card>
      </div>

      <ProjectFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={reload}
      />
    </div>
  );
}
