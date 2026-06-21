import { cn } from '@/lib/utils';

const bandConfig: Record<string, string> = {
  High: 'bg-success-soft text-success',
  Med:  'bg-warning-soft text-warning',
  Low:  'bg-danger-soft text-danger',
};

export function ConfidencePill({ band, score }: { band: string | null; score: number | null }) {
  if (!band) return <span className="text-xs text-ink-faint">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', bandConfig[band] ?? 'bg-surface-subtle text-ink-muted')}>
      {band}
      {score !== null && <span className="opacity-70">· {(score * 100).toFixed(0)}%</span>}
    </span>
  );
}
