import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';

interface ExportRow {
  id: string;
  project_name: string;
  revision_label: string;
  status: string;
  created_at: string;
}

const columns: Column<ExportRow>[] = [
  { key: 'project_name', header: 'Project', render: (r) => <span className="font-medium text-slate-900">{r.project_name}</span> },
  { key: 'revision_label', header: 'Revision', render: (r) => r.revision_label },
  { key: 'status', header: 'Status', render: (r) => <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge> },
  { key: 'created_at', header: 'Generated', render: (r) => new Date(r.created_at).toLocaleDateString() },
];

export default function ExportsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Exports</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          View and download generated submittal packages.
        </p>
      </div>

      <Card>
        <DataTable<ExportRow>
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          empty="No exports yet. Complete a project checklist to generate your first package."
        />
      </Card>
    </div>
  );
}
