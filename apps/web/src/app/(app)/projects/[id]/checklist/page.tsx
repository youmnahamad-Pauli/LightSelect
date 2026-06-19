'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { useChecklist } from '@/hooks/use-checklist';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn } from '@/lib/utils';
import type {
  ChecklistSectionItem,
  ChecklistCategoryItem,
  ChecklistItemStatus,
} from '@/types';

// ─── Status icon ───────────────────────────────────────────────────────────

function StatusIcon({ status, isRequired }: { status: ChecklistItemStatus; isRequired: boolean }) {
  if (status === 'complete') return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
  if (status === 'waived')   return <MinusCircle  className="h-5 w-5 text-ink-faint shrink-0" />;
  return (
    <XCircle className={cn('h-5 w-5 shrink-0', isRequired ? 'text-danger' : 'text-warning')} />
  );
}

// ─── Row background mapping ─────────────────────────────────────────────────

function rowClass(status: ChecklistItemStatus, isRequired: boolean): string {
  if (status === 'complete') return 'border-success/10 bg-success-soft/20';
  if (status === 'waived')   return 'border-border bg-surface-subtle';
  return isRequired ? 'border-danger/15 bg-danger-soft/20' : 'border-warning/15 bg-warning-soft/20';
}

// ─── Section row ───────────────────────────────────────────────────────────

interface SectionRowProps {
  item: ChecklistSectionItem;
  projectId: string;
  onWaive: (itemId: string, toStatus: 'waived' | 'missing') => void;
  waiving: string | null;
}

function SectionRow({ item, projectId, onWaive, waiving }: SectionRowProps) {
  const isMissing = item.status === 'missing';
  const isWaived  = item.status === 'waived';

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors', rowClass(item.status, item.is_required))}>
      <StatusIcon status={item.status} isRequired={item.is_required} />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-ink">{item.section_name}</span>
          {item.section_code && <code className="text-xs text-ink-faint">{item.section_code}</code>}
          <Badge variant={item.is_required ? 'danger' : 'neutral'}>
            {item.is_required ? 'Required' : 'Optional'}
          </Badge>
          {isWaived && <Badge variant="neutral">Waived</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">
          {item.file_count} file{item.file_count !== 1 ? 's' : ''} assigned
          {isMissing && item.is_required && (
            <span className="ml-2 text-danger font-medium">— needs at least one file</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isMissing && (
          <Link
            href={`/projects/${projectId}/files`}
            className="flex items-center gap-1 rounded-lg border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft/30 transition-colors"
          >
            Upload file
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        {isMissing && (
          <button
            onClick={() => onWaive(item.id, 'waived')}
            disabled={waiving === item.id}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
              item.is_required
                ? 'text-ink-muted border border-border hover:bg-surface-hover'
                : 'text-warning border border-warning/20 hover:bg-warning-soft',
            )}
          >
            {item.is_required ? 'Waive (override)' : 'Waive'}
          </button>
        )}
        {isWaived && (
          <button
            onClick={() => onWaive(item.id, 'missing')}
            disabled={waiving === item.id}
            className="rounded-lg px-2.5 py-1 text-xs text-ink-faint border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Remove waiver
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Category row ──────────────────────────────────────────────────────────

interface CategoryRowProps {
  item: ChecklistCategoryItem;
  projectId: string;
  onWaive: (itemId: string, toStatus: 'waived' | 'missing') => void;
  waiving: string | null;
}

function CategoryRow({ item, projectId, onWaive, waiving }: CategoryRowProps) {
  const isMissing = item.status === 'missing';
  const isWaived  = item.status === 'waived';

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', rowClass(item.status, item.is_required))}>
      <StatusIcon status={item.status} isRequired={item.is_required} />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-ink">{item.category_name}</span>
          <span className="text-xs text-ink-faint">—</span>
          <span className="text-sm text-ink-muted">{item.document_type_name}</span>
          {item.document_type_code && <code className="text-xs text-ink-faint">{item.document_type_code}</code>}
          {isWaived && <Badge variant="neutral">Waived</Badge>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isMissing && (
          <Link
            href={`/projects/${projectId}/files`}
            className="flex items-center gap-1 rounded-lg border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft/30 transition-colors"
          >
            Upload file
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        {isMissing && (
          <button
            onClick={() => onWaive(item.id, 'waived')}
            disabled={waiving === item.id}
            className="rounded-lg px-2.5 py-1 text-xs text-warning border border-warning/20 hover:bg-warning-soft transition-colors disabled:opacity-50"
          >
            Waive
          </button>
        )}
        {isWaived && (
          <button
            onClick={() => onWaive(item.id, 'missing')}
            disabled={waiving === item.id}
            className="rounded-lg px-2.5 py-1 text-xs text-ink-faint border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Remove waiver
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Checklist page ────────────────────────────────────────────────────────

export default function ProjectChecklistPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const { checklist, loading, error, reload } = useChecklist(params.id);
  const [waiving, setWaiving] = useState<string | null>(null);
  const [waiveError, setWaiveError] = useState('');
  const [rebuilding, setRebuilding] = useState(false);

  async function handleWaive(itemId: string, toStatus: 'waived' | 'missing') {
    if (!token) return;
    setWaiving(itemId);
    setWaiveError('');
    try {
      await api.checklist.waiveItem(token, itemId, toStatus);
      await reload();
    } catch (err) {
      setWaiveError(err instanceof ApiError ? err.message : 'Failed to update item.');
    } finally {
      setWaiving(null);
    }
  }

  async function handleRebuild() {
    if (!token) return;
    setRebuilding(true);
    try {
      await api.checklist.rebuild(token, params.id);
      await reload();
    } catch {
      // silently reload anyway
    } finally {
      setRebuilding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error || !checklist) {
    return <Alert variant="error">{error ?? 'Failed to load checklist.'}</Alert>;
  }

  const progressPct = checklist.total_required === 0
    ? 100
    : Math.round((checklist.complete_count / checklist.total_required) * 100);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-ink-faint">
          Verify all consultant-required documents are assigned. Export is blocked until required sections are complete or waived.
        </p>
      </div>

      {waiveError && (
        <Alert variant="error" onDismiss={() => setWaiveError('')}>{waiveError}</Alert>
      )}

      {/* Export readiness banner */}
      {checklist.no_template ? (
        <Alert variant="warning">
          <strong>No consultant template assigned.</strong> Assign a template to compute export readiness.{' '}
          <Link href={`/projects/${params.id}/overview`} className="underline font-medium">Edit project</Link>
        </Alert>
      ) : checklist.is_export_ready ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-soft/40 px-5 py-4">
          <ShieldCheck className="h-6 w-6 text-success shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-success">Ready to export</p>
            <p className="text-sm text-success/70 mt-0.5">
              All {checklist.total_required} required sections complete.
              {checklist.waived_count > 0 && ` ${checklist.waived_count} waived.`}
            </p>
          </div>
          <Link href={`/projects/${params.id}/exports`}>
            <Button size="sm">
              Go to Exports
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-blocked/25 bg-blocked-soft/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-blocked shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-blocked">Export blocked</p>
              <p className="text-sm text-blocked/80 mt-0.5">
                {checklist.blocking_count} required section{checklist.blocking_count !== 1 ? 's' : ''} missing.
                Resolve or waive to enable export.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress summary */}
      {!checklist.no_template && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-ink">
                  {checklist.template_name ?? 'Consultant Template'}
                </p>
                <p className="text-xs text-ink-muted">
                  {checklist.complete_count} of {checklist.total_required} required complete
                  {checklist.waived_count > 0 && ` · ${checklist.waived_count} waived`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleRebuild} loading={rebuilding}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
            <ProgressBar
              value={progressPct}
              size="md"
              variant={checklist.is_export_ready ? 'success' : 'default'}
            />
          </CardContent>
        </Card>
      )}

      {/* Section requirements */}
      {checklist.section_items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Consultant Template Sections</CardTitle>
            <p className="text-xs text-ink-faint">
              Required sections must have at least one mapped file.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklist.section_items.map((item) => (
              <SectionRow
                key={item.item_key}
                item={item}
                projectId={params.id}
                onWaive={handleWaive}
                waiving={waiving}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category requirements */}
      {checklist.category_items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Category Document Requirements</CardTitle>
            <p className="text-xs text-ink-faint">
              Based on the categories present in this project's mapped files.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklist.category_items.map((item) => (
              <CategoryRow
                key={item.item_key}
                item={item}
                projectId={params.id}
                onWaive={handleWaive}
                waiving={waiving}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {checklist.section_items.length === 0 && checklist.category_items.length === 0 && !checklist.no_template && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-ink-faint">
              No sections or category requirements found. Add sections to your consultant template
              and map files to this project.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
