'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, ChevronRight, Tag } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MatchingRequirement } from '@/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MatchingPage() {
  const router = useRouter();
  const { token, organization } = useAuth();
  const [requirements, setRequirements] = useState<MatchingRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !organization?.id) return;
    setLoading(true);
    api.matching
      .listRequirements(token, organization.id)
      .then((d) => setRequirements(d.requirements))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, organization?.id]);

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-ink-muted">No organisation found. Please log in again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Product Matching</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Ranked product candidates from the Phase 3 matching engine — gates, fit scores, and per-attribute evidence.
        </p>
      </div>

      {/* Requirements list */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
        </CardHeader>

        {loading && (
          <CardContent>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-surface-subtle animate-pulse" />
              ))}
            </div>
          </CardContent>
        )}

        {error && (
          <CardContent>
            <p className="text-sm text-danger">{error}</p>
          </CardContent>
        )}

        {!loading && !error && requirements.length === 0 && (
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="h-10 w-10 rounded-full bg-surface-subtle flex items-center justify-center">
                <SlidersHorizontal className="h-5 w-5 text-ink-faint" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">No requirements yet</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Run the matching seed script to create your first requirement.
                </p>
              </div>
            </div>
          </CardContent>
        )}

        {!loading && !error && requirements.length > 0 && (
          <ul className="divide-y divide-border/60">
            {requirements.map((req) => (
              <li key={req.id}>
                <button
                  onClick={() => router.push(`/matching/${req.id}`)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{req.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <Tag className="h-3 w-3" />
                        {req.luminaire_type}
                      </span>
                      {req.description && (
                        <span className="text-xs text-ink-faint truncate hidden sm:block">
                          · {req.description.slice(0, 80)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-xs text-ink-faint">{formatDate(req.created_at)}</span>
                    <ChevronRight className="h-4 w-4 text-ink-faint" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
