// ─── Projects ─────────────────────────────────────────────────────────────

export type ProjectStatus = 'draft' | 'active' | 'archived';

export interface Project {
  id: string;
  organization_id: string;
  project_name: string;
  client_name: string | null;
  consultant_name: string | null;
  project_code: string | null;
  location: string | null;
  revision_label: string | null;
  notes: string | null;
  status: ProjectStatus;
  consultant_template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  project_name: string;
  client_name?: string | null;
  consultant_name?: string | null;
  project_code?: string | null;
  location?: string | null;
  revision_label?: string | null;
  notes?: string | null;
  consultant_template_id?: string | null;
  status?: 'draft' | 'active';
}

export type UpdateProjectInput = Partial<CreateProjectInput & { status: ProjectStatus }>;

// ─── Consultant Templates ──────────────────────────────────────────────────

export interface ConsultantTemplate {
  id: string;
  organization_id: string | null;
  consultant_name: string;
  template_name: string;
  version: string | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultantTemplateListItem extends ConsultantTemplate {
  section_count: number;
}

/** Enriched rule with joined category/document type names. */
export interface ConsultantSectionRuleWithNames {
  id: string;
  consultant_template_section_id: string;
  category_id: string | null;
  category_name: string | null;
  document_type_id: string | null;
  document_type_name: string | null;
  is_allowed: boolean;
  created_at: string;
}

export interface ConsultantTemplateSection {
  id: string;
  consultant_template_id: string;
  section_name: string;
  section_code: string | null;
  section_order: number;
  is_required: boolean;
  accepts_multiple_files: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultantTemplateSectionWithRules extends ConsultantTemplateSection {
  rules: ConsultantSectionRuleWithNames[];
}

export interface ConsultantTemplateWithSections {
  template: ConsultantTemplate;
  sections: ConsultantTemplateSectionWithRules[];
}

export interface CreateTemplateInput {
  consultant_name: string;
  template_name: string;
  version?: string | null;
  description?: string | null;
}

export type UpdateTemplateInput = Partial<CreateTemplateInput & { is_active: boolean }>;

export interface CreateSectionInput {
  section_name: string;
  section_code?: string | null;
  is_required?: boolean;
  accepts_multiple_files?: boolean;
  description?: string | null;
}

export type UpdateSectionInput = Partial<CreateSectionInput>;

// ─── Categories ────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  parent_category_id: string | null;
  parent_name: string | null;
  is_system_defined: boolean;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryRequirement {
  id: string;
  category_id: string;
  document_type_id: string;
  document_type_name: string | null;
  document_type_code: string | null;
  is_required: boolean;
  notes: string | null;
  created_at: string;
}

export interface CategoryDetail extends Category {
  requirements: CategoryRequirement[];
  children: { id: string; name: string; is_active: boolean }[];
}

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
  parent_category_id?: string | null;
  default_document_type_ids?: string[];
}

export type UpdateCategoryInput = Pick<CreateCategoryInput, 'name' | 'description' | 'parent_category_id'>;

// ─── Document Types ────────────────────────────────────────────────────────

export interface DocumentType {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Files ────────────────────────────────────────────────────────────────

export type FileUploadStatus = 'pending' | 'uploaded' | 'failed';

export interface UploadedFile {
  id: string;
  organization_id: string;
  uploaded_by: string;
  original_file_name: string;
  stored_file_name: string;
  mime_type: string | null;
  mime_label: string;
  file_size_bytes: number | null;
  checksum: string | null;
  upload_status: FileUploadStatus;
  /** Null when status is not 'uploaded'. */
  download_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-file state managed by the upload component. */
export interface UploadQueueItem {
  /** Client-side stable key for React lists. */
  key: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
  result?: UploadedFile;
}

// ─── Project Files (mapped) ───────────────────────────────────────────────

export type ProjectFileScope = 'product' | 'category' | 'project';
export type ProjectFileRequiredStatus = 'required' | 'optional' | 'reference';

/** Enriched project file — joined with file, category, document type, and section data. */
export interface MappedProjectFile {
  id: string;
  project_id: string;
  file_id: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  category_id: string;
  category_name: string;
  document_type_id: string;
  document_type_name: string;
  document_type_code: string | null;
  consultant_template_section_id: string;
  section_name: string;
  section_order: number;
  section_is_required: boolean;
  product_id: string | null;
  scope: ProjectFileScope;
  required_status: ProjectFileRequiredStatus;
  notes: string | null;
  version_label: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectFileInput {
  file_id: string;
  category_id: string;
  document_type_id: string;
  consultant_template_section_id: string;
  scope?: ProjectFileScope;
  required_status?: ProjectFileRequiredStatus;
  notes?: string | null;
  version_label?: string | null;
}

export type UpdateProjectFileInput = Partial<Omit<CreateProjectFileInput, 'file_id'>>;

// ─── Products ─────────────────────────────────────────────────────────────

export type ProductSourceType = 'pdf_extract' | 'manual' | 'import';
export type ProductStatus = 'draft' | 'reviewed' | 'approved';
export type AttributeValueSource = 'extracted' | 'manual' | 'na';

export interface ProductAttribute {
  id: string;
  product_id: string;
  attribute_name: string;
  attribute_value: string | null;
  value_source: AttributeValueSource;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductListItem {
  id: string;
  project_id: string;
  category_id: string | null;
  category_name: string | null;
  manufacturer: string | null;
  family_name: string | null;
  model_number: string | null;
  source_type: ProductSourceType;
  status: ProductStatus;
  is_preferred: boolean;
  is_do_not_use: boolean;
  workspace_note: string | null;
  created_at: string;
  updated_at: string;
  filled_attribute_count: number;
}

export interface ProductWithDetails extends ProductListItem {
  attributes: ProductAttribute[];
  linked_files: {
    id: string;
    file_id: string;
    scope: ProjectFileScope;
    required_status: ProjectFileRequiredStatus;
    notes: string | null;
  }[];
}

export interface CreateProductInput {
  manufacturer?: string | null;
  family_name?: string | null;
  model_number?: string | null;
  category_id?: string | null;
  source_type?: ProductSourceType;
  status?: ProductStatus;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface AttributeBatchInput {
  attributes: {
    attribute_name: string;
    attribute_value?: string | null;
    value_source?: AttributeValueSource;
    confidence_score?: number | null;
  }[];
}

// ─── Extraction Jobs ───────────────────────────────────────────────────────

export type ExtractionJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ParserType = 'stub' | 'pdf' | 'ocr';

export interface ExtractionJob {
  id: string;
  project_file_id: string;
  product_id: string | null;
  status: ExtractionJobStatus;
  parser_type: ParserType;
  extracted_count: number | null;
  raw_output: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionRunResult {
  job: ExtractionJob;
  attributes: ProductAttribute[];
}

// ─── Checklist ────────────────────────────────────────────────────────────

export type ChecklistItemStatus = 'missing' | 'complete' | 'waived';
export type ChecklistSourceRule = 'consultant_requirement' | 'category_requirement' | 'manual';

export interface ChecklistSectionItem {
  id: string;
  item_key: string;
  section_id: string;
  section_name: string;
  section_code: string | null;
  section_order: number;
  is_required: boolean;
  file_count: number;
  status: ChecklistItemStatus;
  source_rule: 'consultant_requirement';
}

export interface ChecklistCategoryItem {
  id: string;
  item_key: string;
  category_id: string;
  category_name: string;
  document_type_id: string;
  document_type_name: string;
  document_type_code: string | null;
  is_required: boolean;
  file_count: number;
  status: ChecklistItemStatus;
  source_rule: 'category_requirement';
}

export interface ChecklistResult {
  project_id: string;
  template_id: string | null;
  template_name: string | null;
  no_template: boolean;
  is_export_ready: boolean;
  blocking_count: number;
  total_required: number;
  complete_count: number;
  waived_count: number;
  section_items: ChecklistSectionItem[];
  category_items: ChecklistCategoryItem[];
}

// ─── Spec ──────────────────────────────────────────────────────────────────

export type RequirementPriority = 'mandatory' | 'preferred' | 'optional';
export type RequirementStatus = 'extracted' | 'reviewed' | 'manual';
export type RequirementOperator = 'eq' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains' | 'range' | 'any';
export type ComparisonTargetType = 'product' | 'project_file';
export type ComparisonRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ComparisonResultStatus = 'compliant' | 'deviated' | 'missing' | 'review_needed';

export interface SpecDocument {
  id: string;
  project_id: string;
  file_id: string | null;
  file_name: string | null;
  title: string;
  version_label: string;
  notes: string | null;
  is_active: boolean;
  uploaded_by: string;
  /** Number of requirements extracted into this version. Present in list endpoint. */
  requirement_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SpecDocumentWithRequirements extends SpecDocument {
  requirements: SpecRequirement[];
}

export interface SpecRequirement {
  id: string;
  spec_document_id: string;
  section_name: string | null;
  requirement_group: string | null;
  attribute_key: string;
  attribute_label: string;
  operator: RequirementOperator;
  target_value: string;
  target_unit: string | null;
  tolerance_value: string | null;
  tolerance_unit: string | null;
  priority: RequirementPriority;
  status: RequirementStatus;
  source_reference: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SpecComparisonRun {
  id: string;
  project_id: string;
  spec_document_id: string;
  target_type: ComparisonTargetType;
  target_id: string;
  target_label: string | null;
  run_status: ComparisonRunStatus;
  compliant_count: number;
  deviated_count: number;
  missing_count: number;
  review_needed_count: number;
  created_by: string;
  compared_at: string;
  created_at: string;
}

export interface SpecComparisonResultRow {
  id: string;
  comparison_run_id: string;
  spec_requirement_id: string;
  attribute_key: string;
  attribute_label: string;
  compared_value: string | null;
  compared_unit: string | null;
  comparison_status: ComparisonResultStatus;
  deviation_reason: string | null;
  confidence_score: number | null;
  source_reference: string | null;
  override_status: ComparisonResultStatus | null;
  override_notes: string | null;
  operator: RequirementOperator;
  target_value: string;
  target_unit: string | null;
  priority: RequirementPriority;
  requirement_group: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecComparisonDetail {
  run: SpecComparisonRun;
  results: SpecComparisonResultRow[];
}

export interface DiffSummary {
  added: { attribute_key: string; attribute_label: string; operator: string; target_value: string; target_unit: string | null; priority: string }[];
  removed: { attribute_key: string; attribute_label: string; operator: string; target_value: string; target_unit: string | null; priority: string }[];
  changed: { attribute_key: string; attribute_label: string; from: { operator: string; target_value: string; target_unit: string | null; priority: string }; to: { operator: string; target_value: string; target_unit: string | null; priority: string } }[];
  counts: { added: number; removed: number; changed: number; total_from: number; total_to: number };
}

export interface CreateSpecDocInput {
  title: string;
  version_label: string;
  file_id?: string | null;
  notes?: string | null;
}

export interface UpdateRequirementInput {
  attribute_key?: string;
  attribute_label?: string;
  operator?: RequirementOperator;
  target_value?: string;
  target_unit?: string | null;
  priority?: RequirementPriority;
  status?: RequirementStatus;
  notes?: string | null;
}

// ─── BOQ ──────────────────────────────────────────────────────────────────

export type BoqItemStatus = 'draft' | 'reviewed' | 'locked';
export type BoqPricingSource = 'none' | 'price_list' | 'manual';
export type BoqSourceType = 'spec_document' | 'drawing' | 'dialux' | 'pdf' | 'manual';

export interface SpecProfileItem {
  attribute_key: string;
  attribute_label: string;
  operator: string;
  target_value: string;
  target_unit: string | null;
  priority: 'mandatory' | 'preferred' | 'optional';
}

export type MatchBand = 'strong' | 'acceptable' | 'weak' | 'none';

export interface AttributeMatch    { key: string; label: string; value: string; }
export interface AttributeDeviation { key: string; label: string; product_value: string; spec_requirement: string; }
export interface AttributeMissing   { key: string; label: string; spec_requirement: string; }

export interface CandidateEntry {
  product_id: string;
  product_label: string;
  manufacturer: string | null;
  model_number: string | null;
  /** Legacy simple ratio — always present. */
  compliance_score: number;
  /** Weighted composite score 0.0–1.0 (Priority 14+). */
  match_score?: number;
  match_band?: MatchBand;
  is_from_current_project?: boolean;
  is_preferred?: boolean;
  is_do_not_use?: boolean;
  matched_attributes?: AttributeMatch[];
  deviated_attributes?: AttributeDeviation[];
  missing_attributes?: AttributeMissing[];
  compliant_count: number;
  deviated_count: number;
  missing_count: number;
  review_needed_count: number;
  total_count: number;
}

export interface BoqItemSource {
  id: string;
  boq_item_id: string;
  source_type: BoqSourceType;
  project_file_id: string | null;
  file_id: string | null;
  source_reference: string | null;
  created_at: string;
}

export interface BoqItem {
  id: string;
  project_id: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  quantity: number;
  unit: string;
  spec_document_id: string | null;
  required_spec_profile: SpecProfileItem[] | null;
  product_id: string | null;
  selected_product: {
    id: string;
    manufacturer: string | null;
    model_number: string | null;
    family_name: string | null;
  } | null;
  candidate_product_ids: CandidateEntry[] | null;
  compliance_score: number | null;
  pricing_source: BoqPricingSource;
  price_list_id: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string;
  status: BoqItemStatus;
  sort_order: number;
  notes: string | null;
  sources: BoqItemSource[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBoqItemInput {
  description: string;
  category_id?: string | null;
  quantity?: number;
  unit?: string;
  spec_document_id?: string | null;
  required_spec_profile?: SpecProfileItem[] | null;
  notes?: string | null;
  source_type?: BoqSourceType;
  source_reference?: string | null;
}

export type UpdateBoqItemInput = Partial<{
  description: string;
  category_id: string | null;
  quantity: number;
  unit: string;
  spec_document_id: string | null;
  required_spec_profile: SpecProfileItem[];
  product_id: string | null;
  pricing_source: BoqPricingSource;
  price_list_id: string | null;
  unit_price: number | null;
  currency: string;
  status: BoqItemStatus;
  notes: string | null;
  sort_order: number;
}>;

export interface PriceList {
  id: string;
  project_id: string;
  name: string;
  vendor_name: string | null;
  currency: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface PriceListItem {
  id: string;
  price_list_id: string;
  model_code: string;
  description: string | null;
  unit_price: number;
  currency: string;
  created_at: string;
}

export interface PriceListWithItems extends PriceList {
  items: PriceListItem[];
}

// ─── Exports ──────────────────────────────────────────────────────────────

export type ExportPackageStatus = 'queued' | 'generated' | 'failed';
export type ExportArtifactType = 'placeholder' | 'pdf' | 'xlsx' | 'zip' | 'other';

export interface ChecklistSnapshot {
  total_required: number;
  complete_count: number;
  missing_count: number;
  waived_count: number;
  is_export_ready: boolean;
  template_name: string | null;
  blocking_items: { item_label: string; source_rule: string }[];
}

export interface BoqSnapshot {
  total_items: number;
  total_quantity: number;
  total_price: number | null;
  currency: string | null;
  items_with_product: number;
  compliance_bands: {
    fully_compliant: number;
    mostly_compliant: number;
    partially_compliant: number;
    poor_or_missing: number;
  };
}

export interface ExportPackageArtifact {
  id: string;
  export_package_id?: string;
  artifact_type: ExportArtifactType;
  label: string;
  artifact_url: string | null;
  sort_order: number;
  /** Non-null if this artifact failed to generate. */
  error_message: string | null;
}

export interface ExportPackage {
  id: string;
  project_id: string;
  created_by: string;
  status: ExportPackageStatus;
  artifact_type: ExportArtifactType;
  artifact_path: string | null;
  artifact_url: string | null;
  snapshot_active_spec_document_id: string | null;
  snapshot_checklist_summary: ChecklistSnapshot | null;
  snapshot_boq_summary: BoqSnapshot | null;
  snapshot_notes: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  /** Secondary artifacts (PDF etc). Present in list and detail responses. */
  artifacts?: ExportPackageArtifact[];
}

export interface ExportPackageItem {
  id: string;
  export_package_id: string;
  section_id: string | null;
  section_name: string;
  section_code: string | null;
  section_order: number;
  is_section_required: boolean;
  project_file_id: string | null;
  file_id: string | null;
  file_name: string | null;
  category_name: string | null;
  document_type_name: string | null;
  sort_order: number;
  created_at: string;
}

export interface ExportPackageBoqItem {
  id: string;
  export_package_id: string;
  boq_item_id: string | null;
  description: string;
  category_name: string | null;
  quantity: number;
  unit: string;
  product_name: string | null;
  manufacturer: string | null;
  model_code: string | null;
  compliance_score: number | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  sort_order: number;
  created_at: string;
}

export interface ExportPackageDetail {
  package: ExportPackage;
  items: ExportPackageItem[];
  boq_items: ExportPackageBoqItem[];
  artifacts: ExportPackageArtifact[];
}

export interface ExportBlockedResponse {
  message: string;
  code: 'EXPORT_BLOCKED';
  blocking_reasons: string[];
  checklist_summary: ChecklistSnapshot;
}
