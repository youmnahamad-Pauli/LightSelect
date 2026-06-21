import { cn } from '@/lib/utils';

function fitColor(pct: number, capped: boolean) {
  if (capped) return 'bg-warning';
  if (pct >= 90) return 'bg-success';
  if (pct >= 70) return 'bg-primary';
  if (pct >= 50) return 'bg-warning';
  return 'bg-danger';
}

export function FitBar({ score, isCapped }: { score: number | null; isCapped: boolean }) {
  if (score === null) return <span className="text-xs text-ink-faint">—</span>;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-subtle">
        <div
          className={cn('h-full rounded-full transition-all', fitColor(pct, isCapped))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('w-10 text-right text-xs font-medium tabular-nums', isCapped ? 'text-warning' : 'text-ink')}>
        {pct.toFixed(1)}%
      </span>
      {isCapped && <span className="text-xs text-warning">⚠</span>}
    </div>
  );
}

export function FitNumber({ score, isCapped }: { score: number | null; isCapped: boolean }) {
  if (score === null) return <span className="text-ink-faint">—</span>;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <span className={cn('font-semibold tabular-nums', isCapped ? 'text-warning' : pct >= 90 ? 'text-success' : pct >= 70 ? 'text-ink' : pct >= 50 ? 'text-warning' : 'text-danger')}>
      {pct.toFixed(1)}%{isCapped && ' ⚠'}
    </span>
  );
}
