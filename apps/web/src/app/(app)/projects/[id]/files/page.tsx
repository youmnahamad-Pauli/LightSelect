'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, ArrowRight, AlertTriangle } from 'lucide-react';
import { useProjectContext } from '@/context/project-context';
import { useOrgFiles } from '@/hooks/use-files';
import { useProjectFiles } from '@/hooks/use-project-files';
import { FileUploadZone } from '@/components/files/FileUploadZone';
import { RawFileList } from '@/components/files/RawFileList';
import { MappedFileList } from '@/components/files/MappedFileList';
import { FileMappingWizard } from '@/components/files/FileMappingWizard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import type { MappedProjectFile, UploadedFile } from '@/types';

export default function ProjectFilesPage({ params }: { params: { id: string } }) {
  const { project, reload: reloadProject } = useProjectContext();
  const { files: orgFiles, loading: filesLoading, addFile, deleteFile } = useOrgFiles();
  const {
    projectFiles,
    loading: projectFilesLoading,
    addProjectFile,
    updateProjectFile,
    removeProjectFile,
  } = useProjectFiles(params.id);

  const [wizardFile, setWizardFile] = useState<UploadedFile | null>(null);

  // Unmapped = uploaded files that are NOT yet active project files in this project
  const mappedFileIds = new Set(projectFiles.map((pf) => pf.file_id));
  const unmappedFiles = orgFiles.filter(
    (f) => f.upload_status === 'uploaded' && !mappedFileIds.has(f.id),
  );

  function handleMapped(pf: MappedProjectFile) {
    addProjectFile(pf);
    setWizardFile(null);
  }

  return (
    <div className="space-y-5">
      {/* No template warning */}
      {!project.consultant_template_id && (
        <Alert variant="warning">
          <strong>No consultant template assigned.</strong> File mapping is available, but export
          will be blocked until a template is selected.{' '}
          <Link href={`/projects/${params.id}/overview`} className="underline font-medium">
            Edit project
          </Link>{' '}
          to assign one.
        </Alert>
      )}

      {/* Upload zone */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-brand" />
            <CardTitle>Upload Files</CardTitle>
          </div>
          <p className="text-xs text-slate-500">
            Upload manufacturer PDFs, datasheets, IES files, and supporting documents.
          </p>
        </CardHeader>
        <CardContent>
          <FileUploadZone onUploaded={addFile} />
        </CardContent>
      </Card>

      {/* Unmapped files — ready to assign */}
      {(unmappedFiles.length > 0 || filesLoading) && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded — Not Yet Assigned</CardTitle>
            <p className="text-xs text-slate-500">
              These files are in your workspace but have not been assigned to this project.
              Use <strong>Assign</strong> to map each file to a category and consultant section.
            </p>
          </CardHeader>
          <CardContent>
            <RawFileList
              files={unmappedFiles}
              loading={filesLoading}
              onDeleted={deleteFile}
              onAssign={setWizardFile}
              emptyMessage="All uploaded files are already assigned to this project."
            />
          </CardContent>
        </Card>
      )}

      {/* Mapped project files */}
      <Card>
        <CardHeader>
          <CardTitle>
            Assigned Project Files
            {projectFiles.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                {projectFiles.length} file{projectFiles.length !== 1 ? 's' : ''}
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-slate-500">
            Files mapped to a category and consultant submittal section for this project.
          </p>
        </CardHeader>
        <CardContent>
          <MappedFileList
            projectFiles={projectFiles}
            projectId={params.id}
            templateId={project.consultant_template_id}
            loading={projectFilesLoading}
            onUpdated={updateProjectFile}
            onRemoved={removeProjectFile}
          />
        </CardContent>
      </Card>

      {/* Mapping wizard — opens when a file's Assign button is clicked */}
      {wizardFile && (
        <FileMappingWizard
          open={!!wizardFile}
          onClose={() => setWizardFile(null)}
          file={wizardFile}
          projectId={params.id}
          templateId={project.consultant_template_id}
          onSuccess={handleMapped}
        />
      )}
    </div>
  );
}
