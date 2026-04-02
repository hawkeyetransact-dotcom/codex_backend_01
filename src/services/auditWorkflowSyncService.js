import mongoose from "mongoose";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowMilestoneService } from "./workflowMilestoneService.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";
import { derivePhaseStateFromLegacy, normalizePhaseState } from "./auditPhaseService.js";
import {
  ensurePhaseTracker,
  resolveAssessmentTypeForAudit,
} from "./assessmentTrackingService.js";

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };

export const normalizeAuditTenantScopeId = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

export const buildAuditTenantScopeQuery = (tenantId) => {
  const normalized = normalizeAuditTenantScopeId(tenantId);
  if (!normalized) {
    return { $or: [{ tenantOrgId: null }, { tenantOrgId: { $exists: false } }] };
  }

  const tenantCandidates = [normalized];
  if (mongoose.Types.ObjectId.isValid(normalized)) {
    tenantCandidates.push(new mongoose.Types.ObjectId(normalized));
  }

  return {
    $or: [
      { tenantOrgId: { $in: tenantCandidates } },
      { tenantOrgId: null },
      { tenantOrgId: { $exists: false } },
    ],
  };
};

const ensureWorkflowRecord = async (tenantId, auditId, code) => {
  if (!tenantId || !auditId || !code) return null;
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const existing = await WorkflowMilestoneInstance.findOne(filter);
  if (existing) return existing;
  return WorkflowMilestoneInstance.create({
    ...filter,
    status: "NOT_STARTED",
  });
};

const advanceMilestone = async ({ tenantId, auditId, code, desiredStatus }) => {
  if (!tenantId || !auditId || !code || !desiredStatus) return;
  await ensureWorkflowRecord(tenantId, auditId, code);
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const current = await WorkflowMilestoneInstance.findOne(filter).lean();
  const currentRank = MILESTONE_ORDER[current?.status] ?? 0;
  const desiredRank = MILESTONE_ORDER[desiredStatus] ?? 0;
  if (desiredRank < currentRank || current?.status === desiredStatus) return;

  if (desiredStatus === "IN_PROGRESS") {
    await WorkflowMilestoneService.markMilestoneStarted(auditId, code, { tenantId, role: "system" });
    return;
  }

  if (desiredStatus === "COMPLETED") {
    await WorkflowMilestoneService.markMilestoneCompleted(auditId, code, { tenantId, role: "system" });
    return;
  }

  const update = { status: desiredStatus, updatedAt: new Date() };
  if (desiredStatus === "SKIPPED") update.completedAt = new Date();
  await WorkflowMilestoneInstance.findOneAndUpdate(filter, update, { new: true, upsert: true });
};

export const isSupplierInitiationAcknowledged = (audit) => {
  const supplierDecision = String(audit?.supplierDecision || "").toUpperCase();
  const statusNorm = String(audit?.trackStatus || "").toLowerCase();
  return (
    supplierDecision === "ACCEPTED" ||
    supplierDecision === "PROPOSED" ||
    statusNorm.includes("supplier accepted intimation") ||
    statusNorm.includes("supplier proposed schedule") ||
    statusNorm.includes("audit schedule confirmed")
  );
};

export const bootstrapAuditWorkflowState = async ({
  audit,
  persistPhaseState = true,
  ensureTracking = true,
}) => {
  if (!audit?._id) return { phaseState: null, tracker: null, trackingTenantId: null };

  const phaseState = normalizePhaseState(audit.phaseState || derivePhaseStateFromLegacy(audit));
  if (persistPhaseState && !audit.phaseState) {
    audit.phaseState = phaseState;
    await audit.save();
  }

  const trackingTenantId = normalizeAuditTenantScopeId(
    audit.tenantOrgId || audit.tenant_id || audit.tenantId
  );
  if (!ensureTracking || !trackingTenantId) {
    return { phaseState, tracker: null, trackingTenantId };
  }

  const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId: trackingTenantId });
  if (!assessmentType) {
    return { phaseState, tracker: null, trackingTenantId };
  }

  const tracker = await ensurePhaseTracker({ audit, assessmentType, tenantId: trackingTenantId });
  return { phaseState, tracker, trackingTenantId };
};

export const syncAuditMilestonesFromStatus = async ({
  audit,
  trackStatus,
  questionnaireStatus,
  nextAuditOn,
}) => {
  const auditId = audit?._id;
  const tenantId = await resolveAuditWorkflowTenantId({
    auditId,
    fallbackTenantId: normalizeAuditTenantScopeId(
      audit?.tenantOrgId || audit?.tenant_id || audit?.tenantId
    ),
  });
  if (!tenantId || !auditId) return;

  const statusNorm = String(trackStatus || "").toLowerCase();
  const qStatus = String(questionnaireStatus || "").toLowerCase();
  const hasAuditor = Boolean(audit?.auditor_id);
  const auditorEngaged =
    hasAuditor &&
    (
      [
        "in_progress",
        "sent_to_supplier",
        "supplier_draft",
        "supplier_submitted",
        "followup_requested",
        "followup_submitted",
        "review_completed",
        "auditor_submitted",
      ].includes(qStatus) ||
      statusNorm.includes("questionnaire") ||
      statusNorm.includes("preparation") ||
      statusNorm.includes("execution") ||
      statusNorm.includes("review completed") ||
      statusNorm.includes("report") ||
      statusNorm.includes("closed")
    );
  const supplierAccepted = isSupplierInitiationAcknowledged({
    ...audit,
    trackStatus,
    questionnaireStatus,
    nextAuditOn,
  }) || auditorEngaged;

  if (
    statusNorm.includes("request") ||
    statusNorm.includes("intimation") ||
    qStatus === "request_received"
  ) {
    await advanceMilestone({ tenantId, auditId, code: "AR_CREATED", desiredStatus: "COMPLETED" });
  }

  if (statusNorm.includes("intimation")) {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "INTIMATION_LETTER_SENT",
      desiredStatus: "COMPLETED",
    });
  }

  if (supplierAccepted) {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "SUPPLIER_INTIMATION_ACCEPTED",
      desiredStatus: "COMPLETED",
    });
  }

  if (hasAuditor && (statusNorm.includes("auditor selected") || statusNorm.includes("auditor assigned") || auditorEngaged)) {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "AR_AUDITOR_ASSIGNED",
      desiredStatus: "COMPLETED",
    });
    if (auditorEngaged) {
      await advanceMilestone({
        tenantId,
        auditId,
        code: "AR_AUDITOR_ACCEPTANCE_PENDING",
        desiredStatus: "COMPLETED",
      });
      await advanceMilestone({
        tenantId,
        auditId,
        code: "AR_ACCEPTED",
        desiredStatus: "COMPLETED",
      });
    } else {
      await advanceMilestone({
        tenantId,
        auditId,
        code: "AR_AUDITOR_ACCEPTANCE_PENDING",
        desiredStatus: "IN_PROGRESS",
      });
    }
  }

  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "TEMPLATE_SELECTION_PENDING",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "QUESTIONNAIRE_PREP_IN_PROGRESS",
      desiredStatus: "IN_PROGRESS",
    });
  }

  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "QUESTIONNAIRE_PREP_IN_PROGRESS",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "QUESTIONNAIRE_RELEASED",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "SUPPLIER_RESPONSE_PENDING",
      desiredStatus: "IN_PROGRESS",
    });
  }

  if (qStatus === "supplier_draft") {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "SUPPLIER_RESPONSE_PENDING",
      desiredStatus: "IN_PROGRESS",
    });
  }

  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed")) {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "SUPPLIER_RESPONSE_PENDING",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "SUPPLIER_SUBMITTED",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "AUDITOR_REVIEW_PENDING",
      desiredStatus: "IN_PROGRESS",
    });
  }

  if (qStatus === "followup_requested") {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "AUDITOR_REVIEW_PENDING",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "FOLLOWUP_REQUESTED",
      desiredStatus: "IN_PROGRESS",
    });
  }

  if (qStatus === "followup_submitted") {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "FOLLOWUP_REQUESTED",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "FOLLOWUP_RESPONSES_SUBMITTED",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "AUDITOR_REVIEW_PENDING",
      desiredStatus: "IN_PROGRESS",
    });
  }

  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({
      tenantId,
      auditId,
      code: "AUDITOR_REVIEW_PENDING",
      desiredStatus: "COMPLETED",
    });
    await advanceMilestone({
      tenantId,
      auditId,
      code: "FINAL_REVIEW_AND_SIGNOFF",
      desiredStatus: "IN_PROGRESS",
    });
  }
};
