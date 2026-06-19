import { type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ required, className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn('block text-xs font-medium text-ink-muted', className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-danger/80" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}
