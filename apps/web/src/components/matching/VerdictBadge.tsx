import { cn } from '@/lib/utils';

const verdictConfig: Record<string, { label: string; classes: string; dot: string }> = {
  comply:            { label: 'Comply',        classes: 'bg-success-soft text-success',   dot: 'bg-success' },
  comment:           { label: 'Comment',       classes: 'bg-warning-soft text-warning',   dot: 'bg-warning' },
  deviation:         { label: 'Deviation',     classes: 'bg-danger-soft text-danger',     dot: 'bg-danger' },
  not_applicable:    { label: 'N/A',           classes: 'bg-surface-subtle text-ink-faint', dot: 'bg-ink-faint' },
  gate_pass:         { label: 'Pass',          classes: 'bg-success-soft text-success',   dot: 'bg-success' },
  gate_fail:         { label: 'Fail',          classes: 'bg-danger-soft text-danger',     dot: 'bg-danger' },
  gate_unverifiable: { label: 'Unverifiable',  classes: 'bg-info-soft text-info',         dot: 'bg-info' },
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const cfg = verdictConfig[verdict] ?? { label: verdict, classes: 'bg-surface-subtle text-ink-muted', dot: 'bg-ink-muted' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.classes)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
