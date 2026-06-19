'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy } from 'lucide-react';
import { useTemplates } from '@/hooks/use-templates';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { TemplateFormModal } from '@/components/templates/TemplateFormModal';
import { formatDate } from '@/lib/utils';
import type { ConsultantTemplateListItem } from '@/types';

const columns: Column<ConsultantTemplateListItem>[] = [
  {
    key: 'template_name',
    header: 'Template',
    render: (r) => <span className="font-medium text-slate-900">{r.template_name}</span>,
  },
  {
    key: 'consultant_name',
    header: 'Consultant',
    render: (r) => r.consultant_name,
  },
  {
    key: 'version',
    header: 'Version',
    render: (r) => r.version ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'section_count',
    header: 'Sections',
    render: (r) => (
      <span className="font-medium text-slate-900">{r.section_count}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (
      <Badge variant={r.is_active ? 'success' : 'neutral'}>
        {r.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    key: 'updated_at',
    header: 'Last Updated',
    render: (r) => <span className="text-slate-500">{formatDate(r.updated_at)}</span>,
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { templates, loading, reload } = useTemplates();
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  async function handleDuplicate(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!token) return;
    setDuplicating(id);
    try {
      const result = await api.templates.duplicate(token, id);
      reload();
      router.push(`/templates/${result.template.id}`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to duplicate template.');
    } finally {
      setDuplicating(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Consultant Templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Define the required sections and structure for each consultant's submittal package.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      <Card>
        <DataTable<ConsultantTemplateListItem>
          columns={[
            ...columns,
            {
              key: 'actions',
              header: '',
              width: '80px',
              render: (r) => (
                <button
                  onClick={(e) => handleDuplicate(e, r.id)}
                  disabled={duplicating === r.id}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  title="Duplicate template"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              ),
            },
          ]}
          rows={templates}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={(r) => router.push(`/templates/${r.id}`)}
          empty="No templates yet. Create a consultant template before starting uploads."
        />
      </Card>

      <TemplateFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={reload}
      />
    </div>
  );
}
