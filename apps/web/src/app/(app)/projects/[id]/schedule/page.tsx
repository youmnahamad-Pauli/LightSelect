'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, AlertCircle, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MatchingRequirement, SelectionState } from '@/types';

function LuminaireTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {type}
    </span>
  );
}

function FlagBadges({ req }: { req: MatchingRequirement }) {
  return (
    <span className="flex gap-1">
      {req.flag_wind_load && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Wind</span>
      )}
      {req.flag_dark_sky && (
        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">Dark Sky</span>
      )}
      {req.flag_bend_radius && (
        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">Bend R</span>
      )}
    </span>
  );
}

function ProposedProductCell({ state }: { state: SelectionState | null | undefined }) {
  if (state === undefined) {
    return <span className="text-xs text-slate-300 italic">loading…</span>;
  }
  if (!state || state.mode === 'no_candidates') {
    return <span className="text-xs text-slate-400">no assessable candidate</span>;
  }
  if (state.needs_review) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        selection needs review
      </span>
    );
  }
  const label = state.resolved_display_name ?? '—';
  const truncated = label.length > 40 ? label.slice(0, 38) + '…' : label;
  if (state.mode === 'auto') {
    return (
      <span className="text-xs text-slate-600">
        <span className="text-slate-400 mr-1">auto</span>
        {truncated}
        {state.resolved_rank && <span className="ml-1 text-slate-400">#{state.resolved_rank}</span>}
      </span>
    );
  }
  // manual or override
  return (
    <span className="text-xs text-slate-700">
      <span className={`mr-1 rounded px-1 py-0.5 text-xs font-medium ${state.mode === 'override' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {state.mode === 'override' ? 'override' : 'selected'}
      </span>
      {truncated}
    </span>
  );
}

export default function ProjectSchedulePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { token, organization } = useAuth();
  const [requirements, setRequirements] = useState<MatchingRequirement[]>([]);
  const [selections, setSelections] = useState<Record<string, SelectionState | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    if (!token || !organization) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.matching.listRequirements(token, organization.id, params.id);
      setRequirements(data.requirements);

      // Batch-resolve selection state for all requirements
      if (data.requirements.length > 0) {
        const ids = data.requirements.map((r) => r.id);
        const batch = await api.matching.resolveSelectionsBatch(token, ids);
        setSelections(batch.resolutions);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [token, organization, params.id]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            <ClipboardList className="h-4 w-4 text-brand" />
            Item Schedule
          </CardTitle>
          <p className="text-xs text-slate-500">
            Luminaire requirements extracted from the project spec. Click an item to view match
            results and select a proposed product.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : requirements.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 py-16 text-center">
              <ClipboardList className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">No items in this project&apos;s schedule yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Upload a spec PDF on the Documents tab and click &ldquo;Parse spec&rdquo; to extract items.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-2 pl-0 pr-4 text-left text-xs font-medium text-slate-500">Item</th>
                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-500">Description</th>
                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-500">Type</th>
                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-500">Proposed Product</th>
                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-500">Flags</th>
                    <th className="py-2 pl-4 pr-0 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {requirements.map((req) => {
                    const sel = selections[req.id]; // undefined = loading, null = none
                    return (
                      <tr
                        key={req.id}
                        onClick={() => router.push(`/matching/${req.id}`)}
                        className="cursor-pointer hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-2.5 pl-0 pr-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {req.item_code ?? '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 max-w-[200px]">
                          <p className="truncate">{req.description ?? req.name}</p>
                        </td>
                        <td className="py-2.5 px-4">
                          <LuminaireTypeBadge type={req.luminaire_type} />
                        </td>
                        <td className="py-2.5 px-4 max-w-[260px]">
                          <ProposedProductCell state={sel} />
                        </td>
                        <td className="py-2.5 px-4">
                          <FlagBadges req={req} />
                        </td>
                        <td className="py-2.5 pl-4 pr-0 text-slate-300">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-400">
                {requirements.length} item{requirements.length !== 1 ? 's' : ''} in schedule
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
