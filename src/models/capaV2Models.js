import mongoose from "mongoose";
import {
  CAPA_V2_APPROVAL_DECISIONS,
  CAPA_V2_APPROVAL_STAGES,
  CAPA_V2_AUTOFILL_STATUSES,
  CAPA_V2_CLASSIFICATIONS,
  CAPA_V2_EDITABLE_STAGES,
  CAPA_V2_OWNER_ROLES,
  CAPA_V2_RISK_LEVELS,
  CAPA_V2_SEVERITIES,
  CAPA_V2_SOURCE_TYPES,
  CAPA_V2_STATUSES,
  CAPA_V2_TRIAGE_DECISIONS,
} from "../modules/capaV2/constants.js";

const sourceRefSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: CAPA_V2_SOURCE_TYPES, default: "QUESTIONNAIRE_REVIEW" },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "auditQuestions", index: true },
    commentId: { type: String, default: "" },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-reports", index: true },
    reportObservationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    findingId: { type: mongoose.Schema.Types.ObjectId, index: true },
    evidenceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    evidenceDocumentName: { type: String, default: "" },
    sourcePath: { type: String, default: "" },
    snippet: { type: String, default: "" },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    autoFillStatus: { type: String, enum: CAPA_V2_AUTOFILL_STATUSES, default: "supported_inference" },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const sourceTraceSchema = new mongoose.Schema(
  {
    sourceRecordType: { type: String, default: "" },
    sourceRecordId: { type: String, default: "" },
    sourceLabel: { type: String, default: "" },
    section: { type: String, default: "" },
    subsection: { type: String, default: "" },
    pageNumber: { type: Number, default: null },
    pageRange: { type: String, default: "" },
    snippet: { type: String, default: "" },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  },
  { _id: false }
);

const auditStampSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    actorRole: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const capaCandidateSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products", index: true },
    status: {
      type: String,
      enum: ["NEW", "IN_REVIEW", "TRIAGED", "DISMISSED", "MERGED", "CONVERTED"],
      default: "NEW",
      index: true,
    },
    title: { type: String, required: true },
    issueStatement: { type: String, default: "" },
    detailedDescription: { type: String, default: "" },
    observationCategory: { type: String, default: "" },
    severitySuggestion: { type: String, enum: CAPA_V2_SEVERITIES, default: "MEDIUM" },
    riskRationaleDraft: { type: String, default: "" },
    classificationSuggestion: { type: String, enum: CAPA_V2_CLASSIFICATIONS, default: "FULL_CAPA" },
    dueDateSuggestion: { type: Date, default: null },
    sourceReferences: { type: [sourceRefSchema], default: [] },
    traceability: { type: [sourceTraceSchema], default: [] },
    recurrenceFlag: { type: Boolean, default: false, index: true },
    similarCandidateIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    similarCapaIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    generatedByEngine: { type: String, default: "CAPA_V2_PREFILL_V1" },
    generatedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    triageDecision: { type: String, enum: CAPA_V2_TRIAGE_DECISIONS, default: null },
    linkedCapaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaCandidateSchema.index({ tenantOrgId: 1, status: 1, updatedAt: -1 });
capaCandidateSchema.index({ tenantOrgId: 1, auditId: 1, supplierId: 1 });

const capaSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaNumber: { type: String, required: true, index: true },
    title: { type: String, required: true },
    issueStatement: { type: String, default: "" },
    issueDescription: { type: String, default: "" },
    sourceClassification: { type: String, enum: CAPA_V2_SOURCE_TYPES, default: "QUESTIONNAIRE_REVIEW" },
    classification: { type: String, enum: CAPA_V2_CLASSIFICATIONS, default: "FULL_CAPA" },
    severity: { type: String, enum: CAPA_V2_SEVERITIES, default: "MEDIUM", index: true },
    riskLevel: { type: String, enum: CAPA_V2_RISK_LEVELS, default: "MEDIUM", index: true },
    status: { type: String, enum: CAPA_V2_STATUSES, default: "CAPA_OPEN", index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products", index: true },
    departmentScope: { type: [String], default: [] },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    ownerRole: { type: String, enum: CAPA_V2_OWNER_ROLES, default: "supplier_quality_lead" },
    assignedTeamUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    triageDecision: { type: String, enum: CAPA_V2_TRIAGE_DECISIONS, default: "FORMAL_CAPA_REQUIRED" },
    recurrenceFlag: { type: Boolean, default: false },
    dueDate: { type: Date, default: null, index: true },
    targetClosureDate: { type: Date, default: null, index: true },
    closedAt: { type: Date, default: null },
    closureOutcome: {
      type: String,
      enum: ["EFFECTIVE", "INEFFECTIVE", "CANCELLED", "SUPERSEDED", "MERGED", null],
      default: null,
    },
    lockState: {
      intakeLocked: { type: Boolean, default: false },
      investigationLocked: { type: Boolean, default: false },
      rcaLocked: { type: Boolean, default: false },
      actionPlanLocked: { type: Boolean, default: false },
      effectivenessLocked: { type: Boolean, default: false },
    },
    sourceCandidateId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-candidates", default: null, index: true },
    sourceIntakeId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-intakes", default: null, index: true },
    sourceTriageId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-triage", default: null, index: true },
    latestMetricSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-metric-snapshots", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaSchema.index({ tenantOrgId: 1, capaNumber: 1 }, { unique: true });
capaSchema.index({ tenantOrgId: 1, status: 1, severity: 1, dueDate: 1 });
capaSchema.index({ tenantOrgId: 1, supplierId: 1, siteId: 1, updatedAt: -1 });

const capaSourceLinkSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    sourceType: { type: String, enum: CAPA_V2_SOURCE_TYPES, required: true },
    sourceRecordType: { type: String, required: true },
    sourceRecordId: { type: String, required: true, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "auditQuestions", index: true },
    reportObservationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    findingId: { type: mongoose.Schema.Types.ObjectId, default: null },
    evidenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    evidenceDocumentName: { type: String, default: "" },
    snippet: { type: String, default: "" },
    pageNumber: { type: Number, default: null },
    pageRange: { type: String, default: "" },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    autoFillStatus: { type: String, enum: CAPA_V2_AUTOFILL_STATUSES, default: "supported_inference" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaSourceLinkSchema.index({ tenantOrgId: 1, capaId: 1, sourceRecordId: 1 }, { unique: true });

const capaIntakeSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-candidates", default: null, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products", index: true },
    sourceClassification: { type: String, enum: CAPA_V2_SOURCE_TYPES, default: "QUESTIONNAIRE_REVIEW" },
    triggerSourceRecordIds: { type: [String], default: [] },
    issueTitleDraft: { type: String, default: "" },
    issueStatementDraft: { type: String, default: "" },
    issueDescriptionDraft: { type: String, default: "" },
    observationCategory: { type: String, default: "" },
    severitySuggestion: { type: String, enum: CAPA_V2_SEVERITIES, default: "MEDIUM" },
    riskRationaleDraft: { type: String, default: "" },
    immediateContainmentDraft: { type: String, default: "" },
    ownerRoleSuggestion: { type: String, enum: CAPA_V2_OWNER_ROLES, default: "supplier_quality_lead" },
    classificationSuggestion: { type: String, enum: CAPA_V2_CLASSIFICATIONS, default: "FULL_CAPA" },
    dueDateSuggestion: { type: Date, default: null },
    rootCauseHypothesesDraft: { type: [String], default: [] },
    actionThemesDraft: { type: [String], default: [] },
    sourceReferences: { type: [sourceRefSchema], default: [] },
    autoFillConfidence: { type: Number, min: 0, max: 1, default: 0.5 },
    autoFillStatus: { type: String, enum: CAPA_V2_AUTOFILL_STATUSES, default: "supported_inference" },
    generatedAt: { type: Date, default: Date.now },
    submittedForTriageAt: { type: Date, default: null },
    submittedForTriageBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    state: { type: String, enum: ["DRAFT", "SUBMITTED", "ARCHIVED"], default: "DRAFT", index: true },
    userOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaIntakeSchema.index({ tenantOrgId: 1, state: 1, updatedAt: -1 });

const capaTriageSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    intakeId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-intakes", required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-candidates", default: null, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    triageState: { type: String, enum: ["OPEN", "IN_REVIEW", "DECIDED"], default: "OPEN", index: true },
    decision: { type: String, enum: CAPA_V2_TRIAGE_DECISIONS, default: null, index: true },
    rationale: { type: String, default: "" },
    riskLevel: { type: String, enum: CAPA_V2_RISK_LEVELS, default: "MEDIUM" },
    severity: { type: String, enum: CAPA_V2_SEVERITIES, default: "MEDIUM" },
    correctionRequired: { type: Boolean, default: false },
    formalCapaRequired: { type: Boolean, default: false },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    linkedCapaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaTriageSchema.index({ tenantOrgId: 1, triageState: 1, updatedAt: -1 });

const capaInvestigationSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true, unique: true },
    investigationSummary: { type: String, default: "" },
    scope: { type: String, default: "" },
    dataReviewed: { type: [String], default: [] },
    interviews: { type: [String], default: [] },
    timeline: { type: [mongoose.Schema.Types.Mixed], default: [] },
    conclusions: { type: String, default: "" },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaRootCauseSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true, unique: true },
    method: { type: String, enum: ["FIVE_WHYS", "FISHBONE", "FMEA", "OTHER"], default: "FIVE_WHYS" },
    fiveWhys: { type: [String], default: [] },
    fishbone: { type: mongoose.Schema.Types.Mixed, default: {} },
    fmeaInputs: { type: mongoose.Schema.Types.Mixed, default: {} },
    hypotheses: { type: [String], default: [] },
    confirmedRootCause: { type: String, default: "" },
    verificationEvidence: { type: [String], default: [] },
    submittedForApprovalAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaActionPlanSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true, unique: true },
    correctionSummary: { type: String, default: "" },
    correctiveSummary: { type: String, default: "" },
    preventiveSummary: { type: String, default: "" },
    requiresChangeControl: { type: Boolean, default: false },
    requiresValidation: { type: Boolean, default: false },
    plannedStartDate: { type: Date, default: null },
    plannedEndDate: { type: Date, default: null },
    submittedForApprovalAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaActionItemSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    actionPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-action-plans", default: null, index: true },
    actionType: { type: String, enum: ["CORRECTION", "CORRECTIVE", "PREVENTIVE"], default: "CORRECTIVE" },
    description: { type: String, required: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    ownerRole: { type: String, enum: CAPA_V2_OWNER_ROLES, default: "supplier_quality_lead" },
    dependencyActionItemIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    dueDate: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"],
      default: "NOT_STARTED",
      index: true,
    },
    completionEvidenceRequired: { type: Boolean, default: true },
    completionNote: { type: String, default: "" },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaActionItemSchema.index({ tenantOrgId: 1, capaId: 1, status: 1, dueDate: 1 });

const capaImplementationEvidenceSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    actionItemId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2-action-items", default: null, index: true },
    evidenceType: { type: String, default: "DOCUMENT" },
    documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    documentName: { type: String, default: "" },
    url: { type: String, default: "" },
    note: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaEffectivenessCheckSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true, unique: true },
    acceptanceCriteria: { type: String, default: "" },
    reviewPeriodDays: { type: Number, default: 30, min: 1 },
    sampleSize: { type: Number, default: 0, min: 0 },
    recordsReviewed: { type: [String], default: [] },
    result: { type: String, enum: ["PENDING", "PASS", "FAIL"], default: "PENDING", index: true },
    recurrenceDetected: { type: Boolean, default: false },
    reviewerNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaApprovalSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    stage: { type: String, enum: CAPA_V2_APPROVAL_STAGES, required: true, index: true },
    decision: { type: String, enum: CAPA_V2_APPROVAL_DECISIONS, required: true, index: true },
    note: { type: String, default: "" },
    approverUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    approverRole: { type: String, default: "" },
    decidedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaCommentSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    stage: { type: String, enum: CAPA_V2_EDITABLE_STAGES, default: "INVESTIGATION" },
    visibility: { type: String, enum: ["INTERNAL", "SUPPLIER_VISIBLE"], default: "INTERNAL", index: true },
    message: { type: String, required: true },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    createdByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

const capaStatusHistorySchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    fromStatus: { type: String, enum: CAPA_V2_STATUSES, default: null },
    toStatus: { type: String, enum: CAPA_V2_STATUSES, required: true },
    reason: { type: String, default: "" },
    actor: { type: auditStampSchema, default: () => ({}) },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

capaStatusHistorySchema.index({ tenantOrgId: 1, capaId: 1, createdAt: -1 });

const capaRiskAssessmentSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    riskScore: { type: Number, default: 0 },
    riskLevel: { type: String, enum: CAPA_V2_RISK_LEVELS, default: "MEDIUM" },
    patientImpact: { type: String, default: "" },
    productImpact: { type: String, default: "" },
    complianceImpact: { type: String, default: "" },
    recurrenceRisk: { type: String, default: "" },
    rationale: { type: String, default: "" },
    assessedAt: { type: Date, default: Date.now },
    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

const capaMetricSnapshotSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    snapshotAt: { type: Date, default: Date.now, index: true },
    ageDays: { type: Number, default: 0 },
    overdueDays: { type: Number, default: 0 },
    actionItemsTotal: { type: Number, default: 0 },
    actionItemsClosed: { type: Number, default: 0 },
    effectivenessResult: { type: String, enum: ["PENDING", "PASS", "FAIL"], default: "PENDING" },
    recurrenceFlag: { type: Boolean, default: false },
    status: { type: String, enum: CAPA_V2_STATUSES, default: "CAPA_OPEN" },
  },
  { timestamps: true }
);

const capaSimilarityLinkSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    capaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    relatedCapaId: { type: mongoose.Schema.Types.ObjectId, ref: "capa-v2", required: true, index: true },
    linkType: { type: String, enum: ["SIMILAR", "RECURRENCE", "POTENTIAL_DUPLICATE"], default: "SIMILAR", index: true },
    similarityScore: { type: Number, min: 0, max: 1, default: 0.5 },
    rationale: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

capaSimilarityLinkSchema.index({ tenantOrgId: 1, capaId: 1, relatedCapaId: 1 }, { unique: true });

export const CapaCandidate = mongoose.model("capa-v2-candidates", capaCandidateSchema);
export const CapaV2 = mongoose.model("capa-v2", capaSchema);
export const CapaSourceLink = mongoose.model("capa-v2-source-links", capaSourceLinkSchema);
export const CapaIntake = mongoose.model("capa-v2-intakes", capaIntakeSchema);
export const CapaTriage = mongoose.model("capa-v2-triage", capaTriageSchema);
export const CapaInvestigation = mongoose.model("capa-v2-investigations", capaInvestigationSchema);
export const CapaRootCause = mongoose.model("capa-v2-root-causes", capaRootCauseSchema);
export const CapaActionPlan = mongoose.model("capa-v2-action-plans", capaActionPlanSchema);
export const CapaActionItem = mongoose.model("capa-v2-action-items", capaActionItemSchema);
export const CapaImplementationEvidence = mongoose.model(
  "capa-v2-implementation-evidence",
  capaImplementationEvidenceSchema
);
export const CapaEffectivenessCheck = mongoose.model("capa-v2-effectiveness-checks", capaEffectivenessCheckSchema);
export const CapaApproval = mongoose.model("capa-v2-approvals", capaApprovalSchema);
export const CapaComment = mongoose.model("capa-v2-comments", capaCommentSchema);
export const CapaStatusHistory = mongoose.model("capa-v2-status-history", capaStatusHistorySchema);
export const CapaRiskAssessment = mongoose.model("capa-v2-risk-assessments", capaRiskAssessmentSchema);
export const CapaMetricSnapshot = mongoose.model("capa-v2-metric-snapshots", capaMetricSnapshotSchema);
export const CapaSimilarityLink = mongoose.model("capa-v2-similarity-links", capaSimilarityLinkSchema);
