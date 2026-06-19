'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useChecklist } from '@/hooks/use-checklist';
import { useSpecDocuments } from '@/hooks/use-spec';
import { useBoqItems } from '@/hooks/use-boq';
import { ExportReadinessBanner } from '@/components/exports/ExportReadinessBanner';
import { PackagePreview } from '@/components/exports/PackagePreview';
import { Button } from '@/components/ui/button';

export default function ProjectPreviewPage({ params }: { params: { id: string } }) {
  const { project } = useProjectContext();
  const { checklist, loading: checklistLoading } = useChecklist(params.id);
  const { documents: specDocuments } = useSpecDocuments(params.id);
  const { items: boqItems } = useBoqItems(params.id);

  if (checklistLoading || !checklist) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Package Preview</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Review the export structure before generating. This reflects the current live state.
          </p>
        </div>
        <Link href={`/projects/${params.id}/exports`}>
          <Button>
            Go to Exports
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <ExportReadinessBanner checklist={checklist} projectId={params.id} />

      <PackagePreview
        checklist={checklist}
        specDocuments={specDocuments}
        boqItems={boqItems}
        projectId={params.id}
      />
    </div>
  );
}
