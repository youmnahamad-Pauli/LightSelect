import type {
  ChecklistResult,
  ExportPackage,
  ExportPackageDetail,
  BoqItem,
  CreateBoqItemInput,
  UpdateBoqItemInput,
  CandidateEntry,
  PriceList,
  PriceListWithItems,
  SpecDocument,
  SpecDocumentWithRequirements,
  SpecRequirement,
  SpecComparisonRun,
  SpecComparisonDetail,
  DiffSummary,
  CreateSpecDocInput,
  UpdateRequirementInput,
  ComparisonTargetType,
  ComparisonResultStatus,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ConsultantTemplateListItem,
  ConsultantTemplateWithSections,
  ConsultantTemplateSectionWithRules,
  ConsultantSectionRuleWithNames,
  CreateTemplateInput,
  UpdateTemplateInput,
  CreateSectionInput,
  UpdateSectionInput,
  Category,
  CategoryDetail,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryRequirement,
  DocumentType,
  UploadedFile,
  MappedProjectFile,
  CreateProjectFileInput,
  UpdateProjectFileInput,
  ProductListItem,
  ProductWithDetails,
  ProductAttribute,
  CreateProductInput,
  UpdateProductInput,
  AttributeBatchInput,
  ExtractionJob,
  ExtractionRunResult,
  MatchingRequirement,
  MatchDecisionSummary,
  MatchDecisionDetail,
  SelectionState,
  ProjectDocument,
  ProjectDocumentType,
  SpecParseResult,
  SubmittalTemplate,
  SubmittalTemplateWithItems,
  SubmittalCompletenessResult,
  SubmittalGateCheckResult,
  PackageManifest,
  PackageGenerateResult,
  ConversationMessage,
  ConversationResult,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const body = await res.json();

  if (!res.ok || !body.success) {
    throw new ApiError(res.status, body.error?.message ?? 'Request failed', body.error?.code);
  }
  return body.data as T;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{
        token: string;
        user: { id: string; email: string; full_name: string; role: string };
        organization: { id: string; name: string } | null;
      }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: (token: string) =>
      request<{
        user: { id: string; email: string; full_name: string; role: string };
        organization: { id: string; name: string } | null;
        orgRole: string | null;
      }>('/auth/me', { token }),
    logout: (token: string) => request('/auth/logout', { method: 'POST', token }),
  },

  projects: {
    list: (token: string) => request<Project[]>('/projects', { token }),
    create: (token: string, data: CreateProjectInput) =>
      request<Project>('/projects', { method: 'POST', body: JSON.stringify(data), token }),
    get: (token: string, id: string) => request<Project>(`/projects/${id}`, { token }),
    update: (token: string, id: string, data: UpdateProjectInput) =>
      request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
    archive: (token: string, id: string) =>
      request<{ archived: boolean }>(`/projects/${id}`, { method: 'DELETE', token }),
  },

  templates: {
    list: (token: string) =>
      request<ConsultantTemplateListItem[]>('/consultant-templates', { token }),
    create: (token: string, data: CreateTemplateInput) =>
      request<ConsultantTemplateWithSections>('/consultant-templates', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    get: (token: string, id: string) =>
      request<ConsultantTemplateWithSections>(`/consultant-templates/${id}`, { token }),
    update: (token: string, id: string, data: UpdateTemplateInput) =>
      request<ConsultantTemplateListItem>(`/consultant-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    duplicate: (token: string, id: string) =>
      request<ConsultantTemplateWithSections>(`/consultant-templates/${id}/duplicate`, {
        method: 'POST',
        token,
      }),
    addSection: (token: string, templateId: string, data: CreateSectionInput) =>
      request<ConsultantTemplateSectionWithRules>(`/consultant-templates/${templateId}/sections`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    reorderSections: (token: string, templateId: string, sectionIds: string[]) =>
      request<ConsultantTemplateSectionWithRules[]>(
        `/consultant-templates/${templateId}/sections/reorder`,
        { method: 'POST', body: JSON.stringify({ section_ids: sectionIds }), token },
      ),
    updateSection: (token: string, sectionId: string, data: UpdateSectionInput) =>
      request<ConsultantTemplateSectionWithRules>(`/consultant-template-sections/${sectionId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    deleteSection: (token: string, sectionId: string) =>
      request<{ deleted: boolean }>(`/consultant-template-sections/${sectionId}`, {
        method: 'DELETE',
        token,
      }),
    addRule: (
      token: string,
      sectionId: string,
      data: { category_id?: string | null; document_type_id?: string | null; is_allowed?: boolean },
    ) =>
      request<ConsultantSectionRuleWithNames>(
        `/consultant-template-sections/${sectionId}/rules`,
        { method: 'POST', body: JSON.stringify(data), token },
      ),
    deleteRule: (token: string, sectionId: string, ruleId: string) =>
      request<{ deleted: boolean }>(
        `/consultant-template-sections/${sectionId}/rules/${ruleId}`,
        { method: 'DELETE', token },
      ),
  },

  categories: {
    list: (token: string) => request<Category[]>('/categories', { token }),
    create: (token: string, data: CreateCategoryInput) =>
      request<CategoryDetail>('/categories', { method: 'POST', body: JSON.stringify(data), token }),
    get: (token: string, id: string) => request<CategoryDetail>(`/categories/${id}`, { token }),
    update: (token: string, id: string, data: UpdateCategoryInput) =>
      request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
    archive: (token: string, id: string) =>
      request<{ archived: boolean }>(`/categories/${id}`, { method: 'DELETE', token }),
    addRequirement: (
      token: string,
      categoryId: string,
      data: { document_type_id: string; is_required?: boolean; notes?: string | null },
    ) =>
      request<CategoryRequirement>(`/categories/${categoryId}/requirements`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    removeRequirement: (token: string, requirementId: string) =>
      request<{ deleted: boolean }>(`/category-requirements/${requirementId}`, {
        method: 'DELETE',
        token,
      }),
  },

  documentTypes: {
    list: (token: string) => request<DocumentType[]>('/document-types', { token }),
    create: (token: string, data: { name: string; code?: string | null; description?: string | null }) =>
      request<DocumentType>('/document-types', { method: 'POST', body: JSON.stringify(data), token }),
  },

  files: {
    list: (token: string) => request<UploadedFile[]>('/files', { token }),
    get: (token: string, id: string) => request<UploadedFile>(`/files/${id}`, { token }),
    delete: (token: string, id: string) =>
      request<{ deleted: boolean }>(`/files/${id}`, { method: 'DELETE', token }),
  },

  projectFiles: {
    list: (token: string, projectId: string) =>
      request<MappedProjectFile[]>(`/projects/${projectId}/files`, { token }),
    create: (token: string, projectId: string, data: CreateProjectFileInput) =>
      request<MappedProjectFile>(`/projects/${projectId}/files`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    get: (token: string, id: string) =>
      request<MappedProjectFile>(`/project-files/${id}`, { token }),
    update: (token: string, id: string, data: UpdateProjectFileInput) =>
      request<MappedProjectFile>(`/project-files/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    remove: (token: string, id: string) =>
      request<{ removed: boolean }>(`/project-files/${id}`, { method: 'DELETE', token }),
  },

  products: {
    list: (token: string, projectId: string) =>
      request<ProductListItem[]>(`/projects/${projectId}/products`, { token }),
    create: (token: string, projectId: string, data: CreateProductInput) =>
      request<ProductWithDetails>(`/projects/${projectId}/products`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    get: (token: string, id: string) =>
      request<ProductWithDetails>(`/products/${id}`, { token }),
    update: (token: string, id: string, data: UpdateProductInput) =>
      request<ProductWithDetails>(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (token: string, id: string) =>
      request<{ deleted: boolean }>(`/products/${id}`, { method: 'DELETE', token }),
    saveAttributes: (token: string, id: string, data: AttributeBatchInput) =>
      request<ProductAttribute[]>(`/products/${id}/attributes`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    linkFile: (token: string, productId: string, projectFileId: string) =>
      request<{ linked: boolean }>(`/products/${productId}/files/${projectFileId}`, {
        method: 'POST',
        token,
      }),
    setWorkspaceFlags: (
      token: string,
      id: string,
      flags: { is_preferred?: boolean; is_do_not_use?: boolean; workspace_note?: string | null },
    ) =>
      request<ProductWithDetails>(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(flags),
        token,
      }),
    unlinkFile: (token: string, productId: string, projectFileId: string) =>
      request<{ unlinked: boolean }>(`/products/${productId}/files/${projectFileId}`, {
        method: 'DELETE',
        token,
      }),
  },

  checklist: {
    get: (token: string, projectId: string) =>
      request<ChecklistResult>(`/projects/${projectId}/checklist`, { token }),
    rebuild: (token: string, projectId: string) =>
      request<ChecklistResult>(`/projects/${projectId}/checklist/rebuild`, {
        method: 'POST',
        token,
      }),
    waiveItem: (token: string, itemId: string, status: 'waived' | 'missing') =>
      request(`/checklist-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
        token,
      }),
  },

  spec: {
    listDocuments: (token: string, projectId: string) =>
      request<SpecDocument[]>(`/projects/${projectId}/spec`, { token }),
    createDocument: (token: string, projectId: string, data: CreateSpecDocInput) =>
      request<SpecDocumentWithRequirements>(`/projects/${projectId}/spec`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    getDocument: (token: string, id: string) =>
      request<SpecDocumentWithRequirements>(`/spec-documents/${id}`, { token }),
    updateDocument: (token: string, id: string, data: Partial<CreateSpecDocInput>) =>
      request<SpecDocument>(`/spec-documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    setActive: (token: string, id: string) =>
      request<SpecDocument>(`/spec-documents/${id}/set-active`, { method: 'POST', token }),
    extractRequirements: (token: string, id: string) =>
      request<{ extracted_count: number; requirements: SpecRequirement[] }>(
        `/spec-documents/${id}/extract`,
        { method: 'POST', token },
      ),
    diffDocuments: (token: string, fromId: string, toId: string) =>
      request<{ diff: unknown; summary: DiffSummary }>(`/spec-documents/${fromId}/diff`, {
        method: 'POST',
        body: JSON.stringify({ compare_to_id: toId }),
        token,
      }),
    updateRequirement: (token: string, id: string, data: UpdateRequirementInput) =>
      request<SpecRequirement>(`/spec-requirements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    addRequirement: (
      token: string,
      specDocumentId: string,
      data: Omit<UpdateRequirementInput, 'status'> & { attribute_key: string; attribute_label: string; operator: string; target_value: string },
    ) =>
      request<SpecRequirement>(`/spec-requirements`, {
        method: 'POST',
        body: JSON.stringify({ spec_document_id: specDocumentId, ...data }),
        token,
      }),
    deleteRequirement: (token: string, id: string) =>
      request<{ deleted: boolean }>(`/spec-requirements/${id}`, { method: 'DELETE', token }),
    runComparison: (
      token: string,
      data: { spec_document_id: string; target_type: ComparisonTargetType; target_id: string },
    ) =>
      request<SpecComparisonDetail>(`/spec-comparisons`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    getComparison: (token: string, id: string) =>
      request<SpecComparisonDetail>(`/spec-comparisons/${id}`, { token }),
    listComparisons: (token: string, projectId: string) =>
      request<SpecComparisonRun[]>(`/projects/${projectId}/spec-comparisons`, { token }),
    overrideResult: (
      token: string,
      resultId: string,
      data: { override_status: ComparisonResultStatus; override_notes?: string | null },
    ) =>
      request(`/spec-comparison-results/${resultId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
  },

  boq: {
    list: (token: string, projectId: string) =>
      request<BoqItem[]>(`/projects/${projectId}/boq`, { token }),
    create: (token: string, projectId: string, data: CreateBoqItemInput) =>
      request<BoqItem>(`/projects/${projectId}/boq`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    get: (token: string, id: string) =>
      request<BoqItem>(`/boq-items/${id}`, { token }),
    update: (token: string, id: string, data: UpdateBoqItemInput) =>
      request<BoqItem>(`/boq-items/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
    delete: (token: string, id: string) =>
      request<{ deleted: boolean }>(`/boq-items/${id}`, { method: 'DELETE', token }),
    suggestCandidates: (token: string, id: string) =>
      request<{ candidates: CandidateEntry[]; item: BoqItem }>(
        `/boq-items/${id}/suggest-candidates`,
        { method: 'POST', token },
      ),
    assignProduct: (
      token: string,
      id: string,
      data: { product_id: string | null; price_list_id?: string | null },
    ) =>
      request<BoqItem>(`/boq-items/${id}/assign-product`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
  },

  priceLists: {
    list: (token: string, projectId: string) =>
      request<PriceList[]>(`/projects/${projectId}/price-lists`, { token }),
    create: (
      token: string,
      projectId: string,
      data: { name: string; vendor_name?: string | null; currency?: string },
    ) =>
      request<PriceListWithItems>(`/projects/${projectId}/price-lists`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    get: (token: string, id: string) =>
      request<PriceListWithItems>(`/price-lists/${id}`, { token }),
    delete: (token: string, id: string) =>
      request<{ deleted: boolean }>(`/price-lists/${id}`, { method: 'DELETE', token }),
  },

  exports: {
    list: (token: string, projectId: string) =>
      request<ExportPackage[]>(`/projects/${projectId}/exports`, { token }),
    create: (token: string, projectId: string, notes?: string) =>
      request<ExportPackageDetail>(`/projects/${projectId}/exports`, {
        method: 'POST',
        body: JSON.stringify({ notes: notes ?? null }),
        token,
      }),
    get: (token: string, id: string) =>
      request<ExportPackageDetail>(`/exports/${id}`, { token }),
    downloadUrl: (id: string) => `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/exports/${id}/download`,
    artifactDownloadUrl: (exportId: string, artifactId: string) =>
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/exports/${exportId}/artifacts/${artifactId}/download`,
  },

  extraction: {
    run: (token: string, projectFileId: string) =>
      request<ExtractionRunResult>(`/project-files/${projectFileId}/extract`, {
        method: 'POST',
        token,
      }),
    listJobs: (token: string, projectFileId: string) =>
      request<ExtractionJob[]>(`/project-files/${projectFileId}/extraction-jobs`, { token }),
    getJob: (token: string, jobId: string) =>
      request<ExtractionJob>(`/extraction-jobs/${jobId}`, { token }),
  },

  projectDocuments: {
    list: (token: string, projectId: string) =>
      request<ProjectDocument[]>(`/projects/${projectId}/documents`, { token }),
    upload: async (token: string, projectId: string, formData: FormData): Promise<ProjectDocument> => {
      const res = await fetch(`${BASE_URL}/projects/${projectId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error?.message ?? 'Upload failed');
      return body.data as ProjectDocument;
    },
    classify: (token: string, docId: string, document_type: ProjectDocumentType) =>
      request<ProjectDocument>(`/project-documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ document_type }),
        token,
      }),
    delete: (token: string, docId: string) =>
      request<{ deleted: boolean }>(`/project-documents/${docId}`, { method: 'DELETE', token }),
    parseSpec: (token: string, projectId: string, document_id: string) =>
      request<SpecParseResult>(`/projects/${projectId}/documents/parse-spec`, {
        method: 'POST',
        body: JSON.stringify({ document_id }),
        token,
      }),
    download: async (token: string, docId: string, filename: string): Promise<void> => {
      const res = await fetch(`${BASE_URL}/project-documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  },

  submittalTemplates: {
    list: (token: string) =>
      request<SubmittalTemplate[]>('/submittal-templates', { token }),
    get: (token: string, id: string) =>
      request<SubmittalTemplateWithItems>(`/submittal-templates/${id}`, { token }),
    create: (token: string, data: { name: string; consultant?: string | null; description?: string | null }) =>
      request<SubmittalTemplateWithItems>('/submittal-templates', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    update: (token: string, id: string, data: { name?: string; consultant?: string | null; description?: string | null; is_active?: boolean }) =>
      request<SubmittalTemplate>(`/submittal-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    delete: (token: string, id: string) =>
      request<{ deleted: boolean }>(`/submittal-templates/${id}`, { method: 'DELETE', token }),
    addItem: (
      token: string,
      templateId: string,
      data: { document_type: string; label: string; required?: boolean; scope: 'project' | 'per_item'; sort_order?: number },
    ) =>
      request<SubmittalTemplateWithItems>(`/submittal-templates/${templateId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),
    updateItem: (token: string, itemId: string, data: { label?: string; required?: boolean; sort_order?: number }) =>
      request<unknown>(`/submittal-template-items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),
    deleteItem: (token: string, itemId: string) =>
      request<{ deleted: boolean }>(`/submittal-template-items/${itemId}`, { method: 'DELETE', token }),
    assignToProject: (token: string, projectId: string, submittal_template_id: string | null) =>
      request<Project>(`/projects/${projectId}/submittal-template`, {
        method: 'PATCH',
        body: JSON.stringify({ submittal_template_id }),
        token,
      }),
  },

  submittalCompleteness: {
    get: (token: string, projectId: string) =>
      request<SubmittalCompletenessResult>(`/projects/${projectId}/submittal-completeness`, { token }),
    check: (
      token: string,
      projectId: string,
      opts?: { is_override?: boolean; override_reason?: string },
    ) =>
      request<SubmittalGateCheckResult>(`/projects/${projectId}/submittal-completeness/check`, {
        method: 'POST',
        body: JSON.stringify(opts ?? {}),
        token,
      }),
    linkDocToItem: (token: string, docId: string, item_id: string | null) =>
      request<ProjectDocument>(`/project-documents/${docId}/item-link`, {
        method: 'PATCH',
        body: JSON.stringify({ item_id }),
        token,
      }),
  },

  submittalPackage: {
    manifest: (token: string, projectId: string) =>
      request<PackageManifest>(`/projects/${projectId}/submittal-package/manifest`, { token }),
    generate: (
      token: string,
      projectId: string,
      opts?: { is_override?: boolean; override_reason?: string },
    ) =>
      request<PackageGenerateResult>(`/projects/${projectId}/submittal-package/generate`, {
        method: 'POST',
        body: JSON.stringify(opts ?? {}),
        token,
      }),
  },

  matching: {
    listRequirements: (token: string, orgId: string, projectId?: string) =>
      request<{ count: number; requirements: MatchingRequirement[] }>(
        `/matching/requirements?org_id=${orgId}${projectId ? `&project_id=${projectId}` : ''}`,
        { token },
      ),
    listDecisions: (token: string, requirementId: string) =>
      request<{ count: number; decisions: MatchDecisionSummary[] }>(
        `/matching/decisions?requirement_id=${requirementId}`,
        { token },
      ),
    getDecision: (token: string, decisionId: string) =>
      request<MatchDecisionDetail>(`/matching/decisions/${decisionId}`, { token }),
    confirmAttr: (token: string, decisionId: string, attributeKey: string) =>
      request<MatchDecisionDetail>(`/matching/decisions/${decisionId}/confirm-attr`, {
        method: 'POST',
        body: JSON.stringify({ attribute_key: attributeKey }),
        token,
      }),
    rerun: (token: string, requirementId: string) =>
      request<unknown>(`/matching/requirements/${requirementId}/run`, {
        method: 'POST',
        token,
      }),
    resolveSelection: (token: string, requirementId: string) =>
      request<SelectionState>(`/matching/requirements/${requirementId}/selection`, { token }),
    resolveSelectionsBatch: (token: string, requirementIds: string[]) =>
      request<{ resolutions: Record<string, SelectionState | null> }>(
        '/matching/requirements/resolve-selections',
        { method: 'POST', body: JSON.stringify({ requirement_ids: requirementIds }), token },
      ),
    setSelection: (
      token: string,
      requirementId: string,
      canonicalProductId: string,
      isOverride = false,
    ) =>
      request<{ requirement: MatchingRequirement; selection: SelectionState }>(
        `/matching/requirements/${requirementId}/selection`,
        {
          method: 'PUT',
          body: JSON.stringify({ canonical_product_id: canonicalProductId, is_override: isOverride }),
          token,
        },
      ),
    clearSelection: (token: string, requirementId: string) =>
      request<{ requirement: MatchingRequirement; selection: SelectionState }>(
        `/matching/requirements/${requirementId}/selection`,
        { method: 'DELETE', token },
      ),
    aecomExportUrl: (requirementId: string) =>
      `${BASE_URL}/matching/requirements/${requirementId}/export/aecom`,
  },

  conversation: {
    send: (
      token: string,
      projectId: string,
      message: string,
      history: ConversationMessage[] = [],
    ) =>
      request<ConversationResult>(`/projects/${projectId}/conversation`, {
        method: 'POST',
        body: JSON.stringify({ message, history }),
        token,
      }),
  },
};

export { ApiError };
