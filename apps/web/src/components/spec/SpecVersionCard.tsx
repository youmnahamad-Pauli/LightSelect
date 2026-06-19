'use client';

import { useState } from 'react';
import { FileText, CheckCircle2, Sparkles, GitCompare } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { formatDate } from '@/lib/utils';
import type { SpecDocument } from '@/types';

interface SpecVersionCardProps {
  doc: SpecDocument;
  allDocs: SpecDocument[];
  onSetActive: (doc: SpecDocument) => void;
  onExtracted: () => void;
  onViewDetails: (doc: SpecDocument) => void;
  onCompare?: (fromId: string, toId: string) => void;
  /** Pass to show how many requirements exist in this version. */
  requirementCount?: number;
}

export function SpecVersionCard({
  doc,
  allDocs,
  onSetActive,
  onExtracted,
  onViewDetails,
  onCompare,
  requirementCount,
}: SpecVersionCardProps) {
  const { token } = useAuth();
  const [extracting, setExtracting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');

  async function handleExtract() {
    if (!token) return;
    setExtracting(true);
    setError('');
    try {
      await api.spec.extractRequirements(token, doc.id);
      onExtracted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSetActive() {
    if (!token) return;
    setActivating(true);
    try {
      await api.spec.setActive(token, doc.id);
      onSetActive(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set active.');
    } finally {
      setActivating(false);
    }
  }

  const otherDocs = allDocs.filter((d) => d.id !== doc.id);

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-lg bg-primary-soft p-2 shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink truncate">{doc.title}</span>
                <Badge variant="neutral">{doc.version_label}</Badge>
                {doc.is_active && (
                  <Badge variant="success">Active</Badge>
                )}
              </div>
              {doc.file_name && (
                <p className="mt-0.5 text-xs text-ink-faint truncate">{doc.file_name}</p>
              )}
              <p className="mt-0.5 text-xs text-ink-faint">
                Uploaded {formatDate(doc.created_at)}
                {requirementCount != null && (
                  <span className="ml-2">
                    · {requirementCount > 0
                      ? <span className="text-success">{requirementCount} requirement{requirementCount !== 1 ? 's' : ''} extracted</span>
                      : <span className="text-warning">no requirements yet — click Extract</span>
                    }
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!doc.is_active && (
              <Button variant="secondary" size="sm" onClick={handleSetActive} loading={activating}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Set active
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleExtract} loading={extracting}>
              <Sparkles className="h-3.5 w-3.5" />
              {requirementCount && requirementCount > 0 ? 'Re-extract' : 'Extract Requirements'}
            </Button>
            <Button size="sm" onClick={() => onViewDetails(doc)}>
              View
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mt-3" onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {otherDocs.length > 0 && onCompare && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
            <GitCompare className="h-3.5 w-3.5 text-ink-faint shrink-0" />
            <span className="text-xs text-ink-faint">Compare to:</span>
            <div className="flex flex-wrap gap-1.5">
              {otherDocs.map((other) => (
                <button
                  key={other.id}
                  onClick={() => onCompare(doc.id, other.id)}
                  className="text-xs text-primary hover:underline"
                >
                  {other.version_label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
