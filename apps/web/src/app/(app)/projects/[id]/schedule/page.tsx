'use client';

import { useState, useCallback, useEffect } from 'react';
import { ClipboardList, AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MatchingRequirement } from '@/types';

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

export default function ProjectSchedulePage({ params }: { params: { id: string } }) {
  const { token, organization } = useAuth();
  const [requirements, setRequirements] = useState<MatchingRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    if (!token || !organization) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.matching.listRequirements(token, organization.id, params.id);
      setRequirements(data.requirements);
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
            Luminaire requirements extracted from the project spec. Parse a spec on the Documents
            tab to populate this schedule.
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
              <p className="text-sm text-slate-500">No items in this project's schedule yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Upload a spec PDF on the Documents tab and click "Parse spec" to extract items.
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
                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-500">Attributes</th>
                    <th className="py-2 pl-4 pr-0 text-left text-xs font-medium text-slate-500">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {requirements.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 pl-0 pr-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {req.item_code ?? '—'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-xs">
                        <p className="truncate">{req.description ?? req.name}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <LuminaireTypeBadge type={req.luminaire_type} />
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500">
                        {req.informational_attrs && req.informational_attrs.length > 0 ? (
                          <ul className="space-y-0.5">
                            {req.informational_attrs.slice(0, 3).map((a) => (
                              <li key={a.key}>
                                <span className="text-slate-400">{a.label}:</span>{' '}
                                <span className="text-slate-600">{a.value}</span>
                              </li>
                            ))}
                            {req.informational_attrs.length > 3 && (
                              <li className="text-slate-400">
                                +{req.informational_attrs.length - 3} more
                              </li>
                            )}
                          </ul>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-4 pr-0">
                        <FlagBadges req={req} />
                      </td>
                    </tr>
                  ))}
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
