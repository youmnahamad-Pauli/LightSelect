import { type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error' | 'blocked';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const styles: Record<AlertVariant, { wrapper: string; iconEl: ReactNode }> = {
  info: {
    wrapper: 'bg-info-soft border-info/20 text-ink',
    iconEl: <Info className="h-4 w-4 text-info shrink-0" />,
  },
  success: {
    wrapper: 'bg-success-soft border-success/20 text-success',
    iconEl: <CheckCircle2 className="h-4 w-4 text-success shrink-0" />,
  },
  warning: {
    wrapper: 'bg-warning-soft border-warning/20 text-warning',
    iconEl: <AlertTriangle className="h-4 w-4 text-warning shrink-0" />,
  },
  error: {
    wrapper: 'bg-danger-soft border-danger/20 text-danger',
    iconEl: <AlertCircle className="h-4 w-4 text-danger shrink-0" />,
  },
  blocked: {
    wrapper: 'bg-blocked-soft border-blocked/25 text-blocked',
    iconEl: <ShieldAlert className="h-4 w-4 text-blocked shrink-0" />,
  },
};

export function Alert({ variant = 'info', title, children, onDismiss, className }: AlertProps) {
  const { wrapper, iconEl } = styles[variant];
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-3.5 text-sm',
        wrapper,
        className,
      )}
      role="alert"
    >
      <div className="mt-0.5">{iconEl}</div>
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className={cn('leading-relaxed', title ? 'opacity-90' : '')}>{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
