import Link from 'next/link';
import { ShieldCheck, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChecklistResult } from '@/types';

interface ExportReadinessBannerProps {
  checklist: ChecklistResult;
  projectId: string;
  /** Optional: supply blocking reason list from a failed export attempt (422 response). */
  blockingReasons?: string[];
}

export function ExportReadinessBanner({ checklist, projectId, blockingReasons }: ExportReadinessBannerProps) {
  if (checklist.no_template) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-warning">No consultant template assigned</p>
          <p className="text-sm text-warning/80 mt-0.5">
            Export requires a consultant template to define the section structure.{' '}
            <Link href={`/projects/${projectId}/overview`} className="underline font-medium">
              Edit project
            </Link>{' '}
            to assign one.
          </p>
        </div>
      </div>
    );
  }

  if (checklist.is_export_ready) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-soft/40 px-5 py-4">
        <ShieldCheck className="h-5 w-5 text-success shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-success">Ready to export</p>
          <p className="text-sm text-success/70 mt-0.5">
            All {checklist.total_required} required sections are complete.
            {checklist.waived_count > 0 && ` ${checklist.waived_count} waived.`}
          </p>
        </div>
      </div>
    );
  }

  const reasons = blockingReasons ?? checklist.section_items
    .filter((s) => s.is_required && s.status === 'missing')
    .map((s) => s.section_name);

  return (
    <div className="rounded-xl border border-blocked/30 bg-blocked-soft">
      <div className="flex items-start gap-3 px-5 py-4">
        <XCircle className="h-5 w-5 text-blocked shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-blocked">Export blocked</p>
          <p className="text-sm text-blocked/80 mt-0.5">
            {checklist.blocking_count} required section{checklist.blocking_count !== 1 ? 's' : ''} still
            missing. Resolve or waive them to enable export.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/checklist`}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-blocked/30 px-3 py-1.5 text-xs font-medium text-blocked hover:bg-blocked-soft transition-colors"
        >
          View checklist <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {reasons.length > 0 && (
        <div className="border-t border-blocked/20 px-5 py-3 space-y-1">
          {reasons.slice(0, 5).map((r, i) => (
            <p key={i} className="text-xs text-blocked/80 flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blocked/60 shrink-0" />
              {r}
            </p>
          ))}
          {reasons.length > 5 && (
            <p className="text-xs text-blocked/60">+{reasons.length - 5} more</p>
          )}
        </div>
      )}
    </div>
  );
}
