'use client';

import { useState } from 'react';
import { Download, PackagePlus } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useChecklist } from '@/hooks/use-checklist';
import { useExports } from '@/hooks/use-exports';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ExportReadinessBanner } from '@/components/exports/ExportReadinessBanner';
import { ExportHistory } from '@/components/exports/ExportHistory';
import type { ExportBlockedResponse } from '@/types';

export default function ProjectExportsPage({ params }: { params: { id: string } }) {
  const { project } = useProjectContext();
  const { token } = useAuth();
  const { checklist, loading: checklistLoading } = useChecklist(params.id);
  const { exports, loading: exportsLoading, reload } = useExports(params.id);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [blockingReasons, setBlockingReasons] = useState<string[]>([]);
  const [genSuccess, setGenSuccess] = useState('');

  async function handleGenerate() {
    if (!token) return;
    setGenerating(true);
    setGenError('');
    setBlockingReasons([]);
    setGenSuccess('');

    try {
      const result = await api.exports.create(token, params.id);
      setGenSuccess(`Export generated successfully — ${result.items.length} section file${result.items.length !== 1 ? 's' : ''} snapshotted.`);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // Structured blocking response
        try {
          const body = JSON.parse(err.message) as ExportBlockedResponse;
          setBlockingReasons(body.blocking_reasons ?? []);
          setGenError(body.message ?? 'Export is blocked.');
        } catch {
          setGenError(err.message);
        }
      } else {
        setGenError(err instanceof ApiError ? err.message : 'Export generation failed.');
      }
    } finally {
      setGenerating(false);
    }
  }

  const isReady = checklist?.is_export_ready ?? false;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Exports</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Preview and generate consultant-ready submittal packages. Each export is an immutable XLSX snapshot of the project state.
          </p>
        </div>
      </div>

      {/* Readiness banner */}
      {checklist && (
        <ExportReadinessBanner
          checklist={checklist}
          projectId={params.id}
          blockingReasons={blockingReasons.length > 0 ? blockingReasons : undefined}
        />
      )}

      {/* Success / error feedback */}
      {genSuccess && (
        <Alert variant="success" onDismiss={() => setGenSuccess('')}>
          {genSuccess}
        </Alert>
      )}
      {genError && blockingReasons.length === 0 && (
        <Alert variant="error" onDismiss={() => setGenError('')}>
          {genError}
        </Alert>
      )}

      {/* Generate action card */}
      <Card>
        <CardHeader>
          <CardTitle>Generate New Export</CardTitle>
          <p className="text-xs text-ink-faint">
            Creates an immutable snapshot of the current project state — sections, files, BOQ, and spec version.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="flex-1 text-sm text-ink-muted">
              {checklist && !checklist.no_template && (
                <ul className="space-y-1 text-xs">
                  <li>
                    <span className={isReady ? 'text-success' : 'text-danger'}>
                      {isReady ? '✓' : '✗'}
                    </span>{' '}
                    Checklist: {checklist.complete_count}/{checklist.total_required} required sections complete
                  </li>
                  <li className="text-ink-faint">
                    ○ Artifact: XLSX export (BOQ schedule + project summary)
                  </li>
                </ul>
              )}
            </div>
            <Button
              onClick={handleGenerate}
              loading={generating}
              disabled={!isReady || checklistLoading}
            >
              <PackagePlus className="h-4 w-4" />
              {generating ? 'Generating…' : 'Generate Export'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export history */}
      <Card>
        <CardHeader>
          <CardTitle>
            Export History
            {exports.length > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-faint">
                {exports.length} export{exports.length !== 1 ? 's' : ''}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExportHistory exports={exports} loading={exportsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
