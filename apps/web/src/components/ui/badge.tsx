import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'blocked';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-subtle text-ink-muted',
  blocked: 'bg-blocked-soft text-blocked',
};

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-none',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    // Project / product statuses
    case 'active':    return 'success';
    case 'approved':  return 'success';
    case 'reviewed':  return 'success';
    case 'draft':     return 'neutral';
    case 'archived':  return 'warning';

    // Checklist / export states
    case 'complete':  return 'success';
    case 'missing':   return 'danger';
    case 'waived':    return 'neutral';
    case 'blocked':   return 'blocked';

    // File upload states
    case 'uploaded':  return 'success';
    case 'pending':   return 'neutral';
    case 'failed':    return 'danger';

    // Extraction value sources
    case 'extracted': return 'info';
    case 'manual':    return 'success';
    case 'na':        return 'neutral';

    // File mapping states
    case 'unmapped':  return 'warning';
    case 'mapped':    return 'info';

    // Required status
    case 'required':  return 'danger';
    case 'optional':  return 'neutral';
    case 'reference': return 'info';

    default:          return 'neutral';
  }
}
