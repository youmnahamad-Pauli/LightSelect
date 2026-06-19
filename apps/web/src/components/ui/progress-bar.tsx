import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  variant?: 'default' | 'success' | 'error';
}

const trackHeight = { sm: 'h-1.5', md: 'h-2' };

const fillClasses = {
  default: 'bg-primary',
  success: 'bg-success',
  error: 'bg-danger',
};

export function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  size = 'sm',
  variant = 'default',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex-1 overflow-hidden rounded-full bg-border/50',
          trackHeight[size],
        )}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            fillClasses[variant],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
