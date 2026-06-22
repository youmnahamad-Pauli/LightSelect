'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Files, ClipboardList, Package, Pencil, ShieldCheck, AlertTriangle, FileCheck } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useChecklist } from '@/hooks/use-checklist';
import { useSubmittalCompleteness } from '@/hooks/use-submittal-completeness';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatDate } from '@/lib/utils';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="w-36 shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-slate-400">—</span>;
}

export default function OverviewPage({ params }: { params: { id: string } }) {
  const { project, reload } = useProjectContext();
  const { checklist } = useChecklist(params.id);
  const { completeness } = useSubmittalCompleteness(params.id);
  const [editOpen, setEditOpen] = useState(false);

  const progressPct =
    checklist && checklist.total_required > 0
      ? Math.round((checklist.complete_count / checklist.total_required) * 100)
      : null;

  return (
    <div className="space-y-5">
      {/* Export readiness mini-card — shown when checklist data is available */}
      {checklist && !checklist.no_template && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
            checklist.is_export_ready
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          {checklist.is_export_ready ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                checklist.is_export_ready ? 'text-emerald-800' : 'text-red-700'
              }`}
            >
              {checklist.is_export_ready
                ? 'Ready to export'
                : `${checklist.blocking_count} required item${checklist.blocking_count !== 1 ? 's' : ''} missing — export blocked`}
            </p>
            {progressPct !== null && (
              <div className="mt-1.5">
                <ProgressBar
                  value={progressPct}
                  size="sm"
                  variant={checklist.is_export_ready ? 'success' : 'default'}
                />
              </div>
            )}
          </div>
          <Link href={`/projects/${params.id}/checklist`}>
            <Button size="sm" variant="secondary">
              View checklist
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Project details card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="px-5 py-0 pb-2">
            <Row label="Status">
              <Badge variant={statusBadgeVariant(project.status)}>{project.status}</Badge>
            </Row>
            <Row label="Client">{project.client_name ?? <EmptyValue />}</Row>
            <Row label="Location">{project.location ?? <EmptyValue />}</Row>
            <Row label="Internal Code">{project.project_code ?? <EmptyValue />}</Row>
            <Row label="Revision">{project.revision_label ?? <EmptyValue />}</Row>
            <Row label="Consultant">{project.consultant_name ?? <EmptyValue />}</Row>
            <Row label="Template">
              {project.consultant_template_id ? 'Assigned' : <EmptyValue />}
            </Row>
            <Row label="Created">{formatDate(project.created_at)}</Row>
            <Row label="Last updated">{formatDate(project.updated_at)}</Row>
          </CardContent>
        </Card>

        {/* Quick-nav cards */}
        <div className="flex flex-col gap-3">
          {[
            { label: 'Files', icon: Files, href: 'files', description: 'Mapped project files' },
            {
              label: 'Checklist',
              icon: ClipboardList,
              href: 'checklist',
              description: checklist
                ? checklist.is_export_ready
                  ? 'Export ready'
                  : `${checklist.blocking_count} item${checklist.blocking_count !== 1 ? 's' : ''} blocking`
                : 'Required items status',
              urgent: checklist && !checklist.no_template && !checklist.is_export_ready,
            },
            {
              label: 'Submittal',
              icon: FileCheck,
              href: 'submittal',
              description: completeness && !completeness.no_template
                ? completeness.is_export_ready
                  ? 'All items complete'
                  : `${completeness.summary.blocking_missing} item${completeness.summary.blocking_missing !== 1 ? 's' : ''} missing`
                : 'Document checklist',
              urgent: completeness && !completeness.no_template && !completeness.is_export_ready,
            },
            { label: 'Exports', icon: Package, href: 'exports', description: 'Generated packages' },
          ].map(({ label, icon: Icon, href, description, urgent }) => (
            <Link key={href} href={`/projects/${params.id}/${href}`}>
              <Card
                className={`cursor-pointer transition-shadow hover:shadow-md ${
                  urgent ? 'border-red-200' : ''
                }`}
              >
                <CardContent className="flex items-center gap-3 py-4">
                  <div
                    className={`rounded-lg p-2.5 ${
                      urgent ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className={`text-xs ${urgent ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                      {description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Notes */}
      {project.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{project.notes}</p>
          </CardContent>
        </Card>
      )}

      <ProjectFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
        onSuccess={reload}
      />
    </div>
  );
}
