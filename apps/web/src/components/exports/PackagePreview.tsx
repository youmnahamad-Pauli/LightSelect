import Link from 'next/link';
import { CheckCircle2, XCircle, MinusCircle, FileText, Boxes, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChecklistResult, SpecDocument, BoqItem } from '@/types';

// ─── Section preview table ─────────────────────────────────────────────────

function SectionRow({ item }: { item: ChecklistResult['section_items'][number] }) {
  const icon =
    item.status === 'complete' ? <CheckCircle2 className="h-4 w-4 text-success" /> :
    item.status === 'waived' ? <MinusCircle className="h-4 w-4 text-ink-faint" /> :
    <XCircle className={`h-4 w-4 ${item.is_required ? 'text-danger' : 'text-warning'}`} />;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-4 py-2.5',
      item.status === 'complete' ? 'border-success/10 bg-success-soft/20' :
      item.status === 'waived' ? 'border-border bg-surface-subtle' :
      item.is_required ? 'border-danger/15 bg-danger-soft/20' : 'border-warning/15 bg-warning-soft/20',
    )}>
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-ink">{item.section_name}</span>
        {item.section_code && <span className="ml-2 text-xs text-ink-faint">{item.section_code}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-ink-muted">{item.file_count} file{item.file_count !== 1 ? 's' : ''}</span>
        <Badge variant={item.is_required ? 'danger' : 'neutral'}>{item.is_required ? 'Required' : 'Optional'}</Badge>
      </div>
    </div>
  );
}

// ─── PackagePreview ────────────────────────────────────────────────────────

interface PackagePreviewProps {
  checklist: ChecklistResult;
  specDocuments: SpecDocument[];
  boqItems: BoqItem[];
  projectId: string;
}

export function PackagePreview({ checklist, specDocuments, boqItems, projectId }: PackagePreviewProps) {
  const activeSpec = specDocuments.find((d) => d.is_active) ?? specDocuments[0] ?? null;
  const totalBoqPrice = boqItems.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const boqCurrency = boqItems[0]?.currency ?? 'USD';
  const hasPricing = boqItems.some((i) => i.total_price != null);

  // Compliance overview from BOQ
  const fullyCompliant = boqItems.filter((i) => (i.compliance_score ?? 0) >= 1.0).length;
  const withDeviations = boqItems.filter((i) => i.compliance_score != null && (i.compliance_score ?? 0) < 1.0).length;
  const noScore = boqItems.filter((i) => i.compliance_score == null).length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Sections */}
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-primary-soft p-2.5">
              <ScrollText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-ink-muted">Sections</p>
              <p className="text-xl font-bold text-ink">{checklist.complete_count}/{checklist.total_required}</p>
              <p className="text-xs text-ink-faint">complete</p>
            </div>
          </CardContent>
        </Card>

        {/* Spec */}
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-info-soft p-2.5">
              <FileText className="h-5 w-5 text-info" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">Active Spec</p>
              {activeSpec ? (
                <>
                  <p className="text-sm font-semibold text-ink truncate">{activeSpec.title}</p>
                  <p className="text-xs text-ink-faint">{activeSpec.version_label}</p>
                </>
              ) : (
                <p className="text-sm text-ink-faint">None</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* BOQ */}
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-warning-soft p-2.5">
              <Boxes className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-ink-muted">BOQ</p>
              <p className="text-xl font-bold text-ink">{boqItems.length} items</p>
              {hasPricing && (
                <p className="text-xs text-ink-faint">
                  {boqCurrency} {totalBoqPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spec compliance overview */}
      {boqItems.length > 0 && activeSpec && (
        <Card>
          <CardHeader>
            <CardTitle>Spec Compliance Overview</CardTitle>
            <Link href={`/projects/${projectId}/spec`} className="text-xs text-primary hover:underline">
              View spec
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <strong>{fullyCompliant}</strong> fully compliant
              </span>
              {withDeviations > 0 && (
                <span className="flex items-center gap-1.5 text-warning">
                  <XCircle className="h-4 w-4" />
                  <strong>{withDeviations}</strong> with deviations
                </span>
              )}
              {noScore > 0 && (
                <span className="flex items-center gap-1.5 text-ink-faint">
                  <MinusCircle className="h-4 w-4" />
                  <strong>{noScore}</strong> not compared
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section-by-section preview */}
      <Card>
        <CardHeader>
          <CardTitle>
            {checklist.template_name ?? 'Consultant Template Sections'}
          </CardTitle>
          <p className="text-xs text-ink-faint">
            Section structure that will appear in the export package.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.section_items.length === 0 ? (
            <p className="text-sm text-ink-faint">No sections defined in the consultant template.</p>
          ) : (
            checklist.section_items.map((item) => (
              <SectionRow key={item.item_key} item={item} />
            ))
          )}
        </CardContent>
      </Card>

      {/* BOQ preview */}
      {boqItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>BOQ Summary</CardTitle>
            <Link href={`/projects/${projectId}/boq`} className="text-xs text-primary hover:underline">
              View full BOQ
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint uppercase">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint uppercase w-20">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-faint uppercase">Product</th>
                    {hasPricing && <th className="px-3 py-2 text-right text-xs font-semibold text-ink-faint uppercase w-28">Total</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {boqItems.slice(0, 10).map((item) => (
                    <tr key={item.id} className="hover:bg-surface-hover">
                      <td className="px-3 py-2 text-ink">{item.description}</td>
                      <td className="px-3 py-2 text-ink-muted">{item.quantity} {item.unit}</td>
                      <td className="px-3 py-2 text-ink-muted">
                        {item.selected_product
                          ? [item.selected_product.manufacturer, item.selected_product.model_number].filter(Boolean).join(' ')
                          : <span className="text-ink-faint italic">Not selected</span>
                        }
                      </td>
                      {hasPricing && (
                        <td className="px-3 py-2 text-right text-ink">
                          {item.total_price != null ? `${item.currency} ${item.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {boqItems.length > 10 && (
                <p className="text-xs text-ink-faint px-3 py-2">+ {boqItems.length - 10} more rows</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
