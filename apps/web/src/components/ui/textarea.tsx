import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={3}
      className={cn(
        'block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink',
        'placeholder-ink-faint transition-colors resize-none',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        'disabled:bg-surface-subtle disabled:text-ink-faint disabled:cursor-not-allowed',
        error
          ? 'border-danger focus:border-danger focus:ring-danger/20'
          : 'border-border focus:border-primary focus:ring-primary/20',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
