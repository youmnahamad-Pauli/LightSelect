import { Plus, Minus, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DiffSummary } from '@/types';

interface SpecDiffViewProps {
  diff: DiffSummary;
  fromLabel: string;
  toLabel: string;
}

export function SpecDiffView({ diff, fromLabel, toLabel }: SpecDiffViewProps) {
  if (diff.counts.added === 0 && diff.counts.removed === 0 && diff.counts.changed === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle px-5 py-8 text-center">
        <p className="text-sm text-ink-muted">No differences found between {fromLabel} and {toLabel}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {diff.counts.added > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
            <Plus className="h-3.5 w-3.5" />
            {diff.counts.added} added
          </span>
        )}
        {diff.counts.removed > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger">
            <Minus className="h-3.5 w-3.5" />
            {diff.counts.removed} removed
          </span>
        )}
        {diff.counts.changed > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">
            <ArrowRight className="h-3.5 w-3.5" />
            {diff.counts.changed} changed
          </span>
        )}
      </div>

      {/* Added */}
      {diff.added.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-success mb-2">Added in {toLabel}</p>
          <div className="space-y-1">
            {diff.added.map((item) => (
              <div key={item.attribute_key} className="flex items-center gap-3 rounded-lg bg-success-soft/30 border border-success/10 px-3 py-2">
                <Plus className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-sm font-medium text-ink flex-1">{item.attribute_label}</span>
                <span className="text-xs text-ink-muted">{item.operator} {item.target_value}{item.target_unit ? ' ' + item.target_unit : ''}</span>
                <Badge variant={item.priority === 'mandatory' ? 'danger' : item.priority === 'preferred' ? 'warning' : 'neutral'}>
                  {item.priority}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Removed */}
      {diff.removed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-danger mb-2">Removed from {fromLabel}</p>
          <div className="space-y-1">
            {diff.removed.map((item) => (
              <div key={item.attribute_key} className="flex items-center gap-3 rounded-lg bg-danger-soft/30 border border-danger/10 px-3 py-2">
                <Minus className="h-3.5 w-3.5 text-danger shrink-0" />
                <span className="text-sm font-medium text-ink line-through opacity-60 flex-1">{item.attribute_label}</span>
                <span className="text-xs text-ink-faint">{item.operator} {item.target_value}{item.target_unit ? ' ' + item.target_unit : ''}</span>
                <Badge variant="neutral">{item.priority}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changed */}
      {diff.changed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-2">Changed</p>
          <div className="space-y-1.5">
            {diff.changed.map((item) => (
              <div key={item.attribute_key} className="rounded-lg border border-warning/20 bg-warning-soft/20 px-3 py-2.5">
                <p className="text-sm font-medium text-ink mb-1.5">{item.attribute_label}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-ink-muted line-through opacity-70">
                    {item.from.operator} {item.from.target_value}{item.from.target_unit ? ' ' + item.from.target_unit : ''}
                  </span>
                  <ArrowRight className="h-3 w-3 text-ink-faint shrink-0" />
                  <span className="text-ink font-medium">
                    {item.to.operator} {item.to.target_value}{item.to.target_unit ? ' ' + item.to.target_unit : ''}
                  </span>
                  {item.from.priority !== item.to.priority && (
                    <span className="text-ink-faint">
                      Priority: {item.from.priority} → {item.to.priority}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
