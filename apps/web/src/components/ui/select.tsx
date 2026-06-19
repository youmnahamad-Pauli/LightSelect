import { type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, error, className, value, ...props }, ref) => (
    <select
      ref={ref}
      value={value}
      className={cn(
        'block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0',
        'disabled:bg-surface-subtle disabled:text-ink-faint disabled:cursor-not-allowed',
        !value && 'text-ink-faint',
        error
          ? 'border-danger focus:border-danger focus:ring-danger/20'
          : 'border-border focus:border-primary focus:ring-primary/20',
        className,
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="text-ink">
          {opt.label}
        </option>
      ))}
    </select>
  ),
);
Select.displayName = 'Select';
