import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { AuditArtifactVersion } from "../models/auditArtifactVersionModel.js";
import { Template } from "../models/templateModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { PhaseTracker } from "../models/phaseTrackerModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import {
  AUDIT_PHASES,
  AUDIT_PHASE_KEYS,
  AUDIT_ARTIFACT_TYPES,
  PHASE_ARTIFACT_TYPES,
  PHASE_ARTIFACT_DEFAULTS,
} from "../constants/auditPhases.js";
import {
  applyPhaseTransition,
  canTransition,
  derivePhaseStateFromLegacy,
  normalizePhaseState,
} from "../services/auditPhaseService.js";
import {
  ENABLE_PREP_PHASE,
  ENFORCE_AUDIT_PARTICIPANTS,
  ALLOW_EARLY_ARTIFACT_SEND,
} from "../config/featureFlags.js";
import { assertAuditParticipant, canUserAccessAudit } from "../utils/auditAccess.js";
import { writeAuditTrail } from "../services/auditTrailService.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";
import { resolveTemplateTypesForArtifact } from "../utils/templateDefaults.js";
import {
  ensurePhaseTracker,
  resolveAssessmentTypeForAudit,
} from "../services/assessmentTrackingService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";
import {
  applyAuditReservationWindow,
  upsertAuditReservationBlock,
} from "../services/calendarReservationService.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const normalizeType = (value) => String(value || "").toUpperCase();
const resolveActorUsername = (user) => {
  if (!user) return "system";
  const profile = user.profile || {};
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return (
    fullName ||
    user.username ||
    user.email ||
    user.name ||
    (user._id ? String(user._id) : "system")
  );
};

const buildChangeBrief = ({ collection, fields = [] }) => ({
  collection,
  fields: Array.from(new Set(fields.filter(Boolean).map((field) => String(field)))),
});

const resolveAuditLabel = (audit) =>
  audit?.hawkeyeRequestId || audit?.internalRequestId || audit?.supplierRequestId || String(audit?._id || "");

const AUDITOR_PLACEHOLDER_NAME = "TBD";

const isValidDateValue = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const hasRoleSignature = (signatures, roleKey, { allowPlaceholder = true } = {}) => {
  const name = String(signatures?.[`${roleKey}Name`] || "").trim();
  if (!name) return false;
  if (!allowPlaceholder && name.toUpperCase() === AUDITOR_PLACEHOLDER_NAME) return false;
  return isValidDateValue(signatures?.[`${roleKey}SignedAt`]);
};

const hasAllIntimationSignatures = (signatures = {}) =>
  hasRoleSignature(signatures, "buyer") &&
  hasRoleSignature(signatures, "supplier") &&
  hasRoleSignature(signatures, "auditor", { allowPlaceholder: false });

const isIntimationSignoffLocked = (artifact = null) => {
  const status = String(artifact?.status || "").toLowerCase();
  if (status === "complete" || status === "completed") return true;
  return Boolean(
    artifact?.data &&
      typeof artifact.data === "object" &&
      (artifact.data.signaturesLockedAt || artifact.data.signaturesLockedBy)
  );
};

const applyIntimationSignoffLock = ({ data, actorId }) => {
  const next = data && typeof data === "object" ? { ...data } : {};
  const now = new Date();
  next.signaturesLockedAt = next.signaturesLockedAt || now;
  next.signaturesLockedBy = next.signaturesLockedBy || actorId || null;
  next.finalized = true;
  next.finalizedAt = next.finalizedAt || now;
  return next;
};

const applyIntimationSignatureDefaults = (data, fallbackAuditorName = AUDITOR_PLACEHOLDER_NAME) => {
  const nextData = data && typeof data === "object" ? { ...data } : {};
  const signatures =
    nextData.signatures && typeof nextData.signatures === "object" ? { ...nextData.signatures } : {};
  let changed = !(nextData.signatures && typeof nextData.signatures === "object");
  const auditorName = String(signatures.auditorName || "").trim();
  if (!auditorName) {
    signatures.auditorName = fallbackAuditorName;
    changed = true;
  }
  if (changed) {
    nextData.signatures = signatures;
  }
  return { data: nextData, changed };
};

const resolveFallbackTemplateId = async ({ artifactType, tenantId, assessmentTypeId }) => {
  const templateTypes = resolveTemplateTypesForArtifact(artifactType);
  if (!templateTypes.length) return null;
  const filters = [];
  if (tenantId) {
    filters.push({ $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] });
  }
  if (assessmentTypeId) {
    filters.push({
      $or: [
        { assessmentTypeId },
        { assessmentTypeId: null },
        { assessmentTypeId: { $exists: false } },
      ],
    });
  }
  const baseQuery = {
    archiveFlag: { $ne: true },
    $or: [{ templateType: { $in: templateTypes } }, { artifactType: String(artifactType || "").toUpperCase() }],
  };
  const query = filters.length ? { $and: [baseQuery, ...filters] } : baseQuery;
  const templates = await Template.find(query).sort({ updatedAt: -1, templateId: 1 }).lean();
  if (!templates.length) return null;
  const published = templates.find((tpl) => tpl.status === "PUBLISHED");
  return (published || templates[0])?.templateId || null;
};

const isTemplateCompatible = ({ artifactType, template }) => {
  if (!template) return false;
  const normalizedArtifact = normalizeType(artifactType);
  if (!normalizedArtifact) return false;
  if (normalizedArtifact === "EXECUTION_QUESTIONNAIRE") {
    return true;
  }
  const allowedTemplateTypes = resolveTemplateTypesForArtifact(artifactType);
  const normalizedTemplateType = normalizeType(template.templateType);
  const normalizedTemplateArtifact = normalizeType(template.artifactType);
  if (normalizedTemplateType && allowedTemplateTypes.includes(normalizedTemplateType)) return true;
  if (!normalizedTemplateArtifact) return false;
  if (normalizedArtifact === "SCOPE" && ["SCOPE", "AGENDA"].includes(normalizedTemplateArtifact)) {
    return true;
  }
  return normalizedTemplateArtifact === normalizedArtifact;
};

const ensureArtifactTemplate = async ({ audit, artifact, tenantId, user }) => {
  if (!artifact?.artifactType) return artifact;
  const normalizedArtifact = normalizeType(artifact.artifactType);
  let template = null;
  if (artifact.templateId) {
    template = await Template.findOne({ templateId: artifact.templateId })
      .select("templateId templateType artifactType status")
      .lean();
  }
  if (isTemplateCompatible({ artifactType: normalizedArtifact, template })) {
    return artifact;
  }
  if (!artifact.templateId) {
    if (normalizedArtifact === "EXECUTION_QUESTIONNAIRE" && audit?.selectedTemplateId) {
      await AuditArtifact.updateOne(
        { _id: artifact._id },
        { $set: { templateId: audit.selectedTemplateId, updatedBy: user?._id } }
      );
      return { ...artifact, templateId: audit.selectedTemplateId };
    }
    if (normalizedArtifact === "EXECUTION_QUESTIONNAIRE") {
      const fallbackId = await resolveFallbackTemplateId({
        artifactType: normalizedArtifact,
        tenantId,
        assessmentTypeId: audit?.assessmentTypeId || null,
      });
      if (fallbackId) {
        await AuditArtifact.updateOne(
          { _id: artifact._id },
          { $set: { templateId: fallbackId, updatedBy: user?._id } }
        );
        if (audit && !audit.selectedTemplateId) {
          audit.selectedTemplateId = fallbackId;
          audit.isTempleteUsed = true;
          await audit.save();
        }
        return { ...artifact, templateId: fallbackId };
      }
    }
    if (normalizedArtifact !== "EXECUTION_QUESTIONNAIRE") {
      const fallbackId = await resolveFallbackTemplateId({
        artifactType: normalizedArtifact,
        tenantId,
        assessmentTypeId: audit?.assessmentTypeId || null,
      });
      if (fallbackId) {
        await AuditArtifact.updateOne(
          { _id: artifact._id },
          { $set: { templateId: fallbackId, updatedBy: user?._id } }
        );
        return { ...artifact, templateId: fallbackId };
      }
    }
    return artifact;
  }

  if (normalizedArtifact !== "EXECUTION_QUESTIONNAIRE") {
    const fallbackId = await resolveFallbackTemplateId({
      artifactType: normalizedArtifact,
      tenantId,
      assessmentTypeId: audit?.assessmentTypeId || null,
    });
    const nextTemplateId = fallbackId || null;
    await AuditArtifact.updateOne(
      { _id: artifact._id },
      { $set: { templateId: nextTemplateId, updatedBy: user?._id } }
    );
    return { ...artifact, templateId: nextTemplateId };
  }

  await AuditArtifact.updateOne(
    { _id: artifact._id },
    { $set: { templateId: null, updatedBy: user?._id } }
  );
  return { ...artifact, templateId: null };
};

const MILESTONE_CODES = {
  INTIMATION_LETTER_SENT: "INTIMATION_LETTER_SENT",
  SUPPLIER_INTIMATION_ACCEPTED: "SUPPLIER_INTIMATION_ACCEPTED",
  PAQ_SCOPE_SENT_TO_SUPPLIER: "PAQ_SCOPE_SENT_TO_SUPPLIER",
  SUPPLIER_SCOPE_AGENDA_SIGNED: "SUPPLIER_SCOPE_AGENDA_SIGNED",
  PAQ_RESPONDED: "PAQ_RESPONDED",
};

const SUPPLIER_FACING_ARTIFACT_TYPES = new Set([
  "INTIMATION_LETTER",
  "PRE_AUDIT_QUESTIONNAIRE",
  "EXECUTION_QUESTIONNAIRE",
  "DRL",
  "SCOPE",
  "AGENDA",
]);

const markAuditSupplierVisible = ({ audit, actorId }) => {
  if (!audit) return false;
  if (audit.supplierVisible) return false;
  audit.supplierVisible = true;
  audit.supplierVisibleAt = new Date();
  audit.supplierVisibleBy = actorId || null;
  return true;
};

const applyIntimationSent = async ({ audit, artifact, tenantId, actorId }) => {
  const now = new Date();
  const phaseState = resolvePhaseState(audit);
  if (phaseState?.phases?.INITIATED) {
    phaseState.phases.INITIATED.status = phaseState.phases.INITIATED.status || "IN_PROGRESS";
    if (phaseState.phases.INITIATED.status === "NOT_STARTED") {
      phaseState.phases.INITIATED.status = "IN_PROGRESS";
    }
    phaseState.phases.INITIATED.startedAt = phaseState.phases.INITIATED.startedAt || now;
    phaseState.phases.INITIATED.blockers = [];
    phaseState.currentPhase = phaseState.currentPhase || "INITIATED";
    audit.phaseState = phaseState;
  }
  audit.trackStatus = "Audit intimation sent";
  audit.nextAuditOn = "supplier";
  if (!audit.supplierVisible) {
    audit.supplierVisible = true;
    audit.supplierVisibleAt = now;
    audit.supplierVisibleBy = actorId || null;
  }
  await audit.save();

  const trackingTenantId = tenantId || audit.tenantOrgId || null;
  if (trackingTenantId) {
    const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId: trackingTenantId });
    if (assessmentType) {
      const tracker = await ensurePhaseTracker({ audit, assessmentType, tenantId: trackingTenantId });
      if (tracker) {
        const phases = tracker.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker.phases || {};
        if (phases.INITIATED) {
          if (phases.INITIATED.status === "NOT_STARTED") {
            phases.INITIATED.status = "IN_PROGRESS";
          }
          phases.INITIATED.startedAt = phases.INITIATED.startedAt || now;
          phases.INITIATED.blockers = [];
        }
        tracker.currentPhaseKey = tracker.currentPhaseKey || "INITIATED";
        tracker.phases = phases;
        await tracker.save();
      }
    }
    await advanceMilestone({
      tenantId: trackingTenantId,
      auditId: audit._id,
      code: MILESTONE_CODES.INTIMATION_LETTER_SENT,
      desiredStatus: "COMPLETED",
    });
  }

  if (artifact?.templateId) {
    await Template.findOneAndUpdate(
      { templateId: artifact.templateId },
      { $set: { status: "PUBLISHED" } }
    );
  }
};

const shiftMilestoneExpectedAt = async ({ auditId, tenantId, deltaMs }) => {
  if (!auditId || !tenantId || !deltaMs) return;
  const instances = await WorkflowMilestoneInstance.find({
    tenantId,
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    expectedAt: { $ne: null },
  });
  if (!instances.length) return;
  await Promise.all(
    instances.map(async (inst) => {
      if (!inst.expectedAt) return;
      const next = new Date(inst.expectedAt.getTime() + deltaMs);
      inst.expectedAt = next;
      await inst.save();
    })
  );
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
  if (desiredStatus === "IN_PROGRESS") {
    await WorkflowMilestoneService.markMilestoneStarted(auditId, code, { tenantId, role: "system" });
    return;
  }
  if (desiredStatus === "COMPLETED") {
    await WorkflowMilestoneService.markMilestoneCompleted(auditId, code, { tenantId, role: "system" });
  }
};

const artifactOwners = {
  INTIMATION_LETTER: "buyer",
  RFQ: "buyer",
  SCOPE: "auditor",
  AGENDA: "auditor",
  PRE_AUDIT_QUESTIONNAIRE: "supplier",
  DRL: "supplier",
  EXECUTION_QUESTIONNAIRE: "supplier",
  GMP_CHECKLIST: "auditor",
  FINDINGS_LOG: "auditor",
  CAPA_PLAN: "supplier",
  FINAL_REPORT: "auditor",
};

const DEFAULT_REQUIRED_ARTIFACTS = new Set([
  "INTIMATION_LETTER",
  "RFQ",
  "PRE_AUDIT_QUESTIONNAIRE",
  "DRL",
  "SCOPE",
  "EXECUTION_QUESTIONNAIRE",
  "FINDINGS_LOG",
  "CAPA_PLAN",
  "FINAL_REPORT",
]);

const resolveArtifactRequiredMap = (audit) => {
  const map = new Map(
    AUDIT_ARTIFACT_TYPES.map((artifactType) => [
      artifactType,
      DEFAULT_REQUIRED_ARTIFACTS.has(artifactType),
    ])
  );
  const checklist = Array.isArray(audit?.artifactChecklist) ? audit.artifactChecklist : [];
  checklist.forEach((item) => {
    const artifactType = normalizeType(item?.artifactType);
    if (!map.has(artifactType)) return;
    const required = Boolean(item?.required);
    map.set(artifactType, required);
    if (artifactType === "SCOPE") map.set("AGENDA", required);
    if (artifactType === "AGENDA") map.set("SCOPE", required);
  });
  return map;
};

const resolveArtifactRequiredFlag = ({ audit, artifactType, data }) => {
  const normalizedType = normalizeType(artifactType);
  if (!normalizedType) return true;
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "required")) {
    return Boolean(data.required);
  }
  const requiredMap = resolveArtifactRequiredMap(audit);
  if (requiredMap.has(normalizedType)) {
    return Boolean(requiredMap.get(normalizedType));
  }
  return DEFAULT_REQUIRED_ARTIFACTS.has(normalizedType);
};

const loadAudit = async (req) => {
  const rawId = req.params.auditId;
  const resolvedId = await resolveAuditRequestId({
    requestId: rawId,
    AuditRequestModel: AuditRequestMaster,
  });
  const audit = await AuditRequestMaster.findById(resolvedId || rawId);
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  const sameTenant =
    !audit.tenantOrgId ||
    !req.tenantId ||
    String(audit.tenantOrgId) === String(req.tenantId);
  if (!sameTenant) {
    const allowed = await canUserAccessAudit({ user: req.user, audit });
    if (!allowed) {
      const err = new Error("Not Found");
      err.status = 404;
      throw err;
    }
  } else if (ENFORCE_AUDIT_PARTICIPANTS) {
    await assertAuditParticipant({ user: req.user, audit });
  }
  return audit;
};

const resolvePhaseState = (audit) => {
  if (audit.phaseState) return normalizePhaseState(audit.phaseState);
  return derivePhaseStateFromLegacy(audit);
};

const ensureArtifactsForPhase = async ({ audit, phaseKey, user, tenantId }) => {
  const resolvedTenantId = tenantId || audit.tenantOrgId || null;
  const types = PHASE_ARTIFACT_DEFAULTS[phaseKey] || [];
  const artifactRequiredMap = resolveArtifactRequiredMap(audit);
  const created = [];
  for (const artifactType of types) {
    const required = artifactRequiredMap.has(artifactType)
      ? Boolean(artifactRequiredMap.get(artifactType))
      : DEFAULT_REQUIRED_ARTIFACTS.has(artifactType);
    const exists = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(resolvedTenantId),
      auditId: audit._id,
      phaseKey,
      artifactType,
    }).lean();
    if (exists) {
      const nextData =
        exists?.data && typeof exists.data === "object" ? { ...exists.data } : {};
      let shouldUpdate = false;
      const existingRequired = nextData.required;
      if (existingRequired !== required) {
        nextData.required = required;
        shouldUpdate = true;
      }
      if (artifactType === "INTIMATION_LETTER") {
        const seeded = applyIntimationSignatureDefaults(nextData);
        if (seeded.changed) {
          Object.assign(nextData, seeded.data);
          shouldUpdate = true;
        }
      }
      if (shouldUpdate) {
        await AuditArtifact.updateOne(
          { _id: exists._id },
          { $set: { data: nextData, updatedBy: user?._id } }
        );
      }
      continue;
    }
    if (!required) continue;

    const templateId =
      artifactType === "EXECUTION_QUESTIONNAIRE" ? audit.selectedTemplateId || null : null;

    const record = await AuditArtifact.create({
      tenantId: resolvedTenantId,
      auditId: audit._id,
      phaseKey,
      artifactType,
      ownerRole: artifactOwners[artifactType] || null,
      templateId: templateId || null,
      data:
        artifactType === "INTIMATION_LETTER"
          ? applyIntimationSignatureDefaults({ required }).data
          : { required },
      createdBy: user?._id,
      updatedBy: user?._id,
      permissions:
        artifactType === "INTIMATION_LETTER"
          ? ["supplier"]
          : [],
    });
    created.push(record);
  }
  return created;
};

const ensureArtifactsForAudit = async ({ audit, user, tenantId, phaseKeys }) => {
  const keys = Array.isArray(phaseKeys) && phaseKeys.length
    ? phaseKeys
    : Object.keys(PHASE_ARTIFACT_DEFAULTS);
  for (const key of keys) {
    await ensureArtifactsForPhase({ audit, phaseKey: key, user, tenantId });
  }
};

export { ensureArtifactsForAudit };

const findPhaseForArtifact = (artifactType) => {
  if (!artifactType) return null;
  const normalizedArtifactType = normalizeType(artifactType);
  if (!normalizedArtifactType) return null;
  const entries = Object.entries(PHASE_ARTIFACT_TYPES);
  for (const [phaseKey, types] of entries) {
    if (types.includes(normalizedArtifactType)) return phaseKey;
  }
  return null;
};

const computePrepReadiness = async ({ audit, tenantId }) => {
  const resolvedTenantId = tenantId || audit.tenantOrgId || null;
  const artifacts = await AuditArtifact.find({
    tenantId: resolvedTenantId,
    auditId: audit._id,
    phaseKey: "PREP",
  }).lean();
  const byType = new Map(artifacts.map((a) => [a.artifactType, a]));
  const isComplete = (artifact) => artifact?.status === "complete";

  const paq = byType.get("PRE_AUDIT_QUESTIONNAIRE");
  const drl = byType.get("DRL");
  let scope = byType.get("SCOPE");
  if (!scope) {
    scope = await AuditArtifact.findOne({
      tenantId: resolvedTenantId,
      auditId: audit._id,
      artifactType: "SCOPE",
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  const paqOk = isComplete(paq);
  const drlOk = isComplete(drl) || (Array.isArray(drl?.data?.documents) && drl.data.documents.length > 0);
  const scopeOk = isComplete(scope) || scope?.data?.confirmed === true;

  const completed = [paqOk, drlOk, scopeOk].filter(Boolean).length;
  const score = Math.round((completed / 3) * 100);
  const missing = [];
  if (!paqOk) missing.push("PRE_AUDIT_QUESTIONNAIRE");
  if (!drlOk) missing.push("DRL");
  if (!scopeOk) missing.push("SCOPE");

  return {
    score,
    checks: { preAuditQuestionnaire: paqOk, drl: drlOk, scope: scopeOk },
    missing,
  };
};

const resolveScopeAgendaSupplierSignoff = async ({ audit, tenantId }) => {
  const resolvedTenantId = tenantId || audit?.tenantOrgId || null;
  const requiredMap = resolveArtifactRequiredMap(audit);
  const [scopeArtifact, agendaArtifact] = await Promise.all([
    AuditArtifact.findOne({
      ...buildArtifactTenantFilter(resolvedTenantId),
      auditId: audit._id,
      artifactType: "SCOPE",
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean(),
    AuditArtifact.findOne({
      ...buildArtifactTenantFilter(resolvedTenantId),
      auditId: audit._id,
      artifactType: "AGENDA",
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean(),
  ]);

  const artifacts = { SCOPE: scopeArtifact, AGENDA: agendaArtifact };
  const checks = {};
  const missing = [];
  const evaluateSignoff = (artifact) => {
    const signatures =
      artifact?.data?.signatures && typeof artifact.data.signatures === "object"
        ? artifact.data.signatures
        : {};
    const supplierSigned = hasRoleSignature(signatures, "supplier");
    const confirmed =
      artifact?.data?.confirmed === true || String(artifact?.status || "").toLowerCase() === "complete";
    return { supplierSigned, confirmed };
  };

  ["SCOPE", "AGENDA"].forEach((artifactType) => {
    const required = requiredMap.has(artifactType) ? Boolean(requiredMap.get(artifactType)) : true;
    let artifact = artifacts[artifactType];
    let sourceArtifactType = artifactType;
    if (!artifact && artifactType === "AGENDA" && scopeArtifact) {
      artifact = scopeArtifact;
      sourceArtifactType = "SCOPE";
    }
    if (!required) {
      checks[artifactType] = { required: false, supplierSigned: true, confirmed: true, status: artifact?.status || null };
      return;
    }
    const { supplierSigned, confirmed } = evaluateSignoff(artifact);
    checks[artifactType] = {
      required: true,
      supplierSigned,
      confirmed,
      status: artifact?.status || null,
      sourceArtifactType,
    };
    if (!artifact || !supplierSigned || !confirmed) {
      missing.push(artifactType);
    }
  });

  return { ready: missing.length === 0, missing, checks };
};

const SCOPE_SUPPLIER_EDIT_STATUSES = new Set(["sent", "in_progress"]);
const scopeSignatureFieldPattern = /(signature|signed|sign|date)/i;
const normalizeLabelText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const toDateInputValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};
const isIntimationCoAuditorLabel = (label) => {
  const text = normalizeLabelText(label);
  return (
    text.includes("co auditor") ||
    text.includes("coauditor") ||
    text.includes("technical expert")
  );
};
const isIntimationLeadAuditorLabel = (label) => {
  const text = normalizeLabelText(label);
  return (
    text.includes("lead auditor") ||
    (text.includes("auditor") && !isIntimationCoAuditorLabel(text))
  );
};
const isIntimationScheduleDateLabel = (label) => {
  const text = normalizeLabelText(label);
  if (!text) return false;
  return (
    text.includes("primary option") ||
    text.includes("alternative option") ||
    text.includes("alternate option") ||
    text.includes("proposed date") ||
    text.includes("scheduled date") ||
    text.includes("final date") ||
    text.includes("audit date") ||
    text.includes("start date") ||
    text.includes("end date")
  );
};
const resolvePrimaryProposedDate = (rawDates = []) => {
  if (!Array.isArray(rawDates) || !rawDates.length) return null;
  for (const value of rawDates) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};
const resolveEffectiveAuditDate = ({ audit, data }) => {
  const fromData = data?.finalDate || data?.acceptedDate;
  const parsedData = fromData ? new Date(fromData) : null;
  if (parsedData && !Number.isNaN(parsedData.getTime())) return parsedData;
  const proposed = resolvePrimaryProposedDate(audit?.supplierProposedDates);
  if (proposed) return proposed;
  const eta = audit?.auditETA || audit?.complianceDate;
  const parsedEta = eta ? new Date(eta) : null;
  if (parsedEta && !Number.isNaN(parsedEta.getTime())) return parsedEta;
  return null;
};
const resolveIntimationAuditorEditableQuestionIds = async (artifact) => {
  if (!artifact?.templateId) return new Set();
  const questions = await TemplateQuestions.find({ templateId: artifact.templateId })
    .select("_id question")
    .lean();
  const ids = new Set();
  questions.forEach((question) => {
    const id = String(question?._id || "").trim();
    if (!id) return;
    if (isIntimationCoAuditorLabel(question?.question)) {
      ids.add(id);
    }
  });
  return ids;
};
const shiftMilestonesForEtaChange = async ({ audit, tenantId, previousEta, nextEta }) => {
  if (!previousEta || !nextEta) return;
  const prev = new Date(previousEta);
  const next = new Date(nextEta);
  if (Number.isNaN(prev.getTime()) || Number.isNaN(next.getTime())) return;
  const deltaMs = next.getTime() - prev.getTime();
  if (!deltaMs) return;
  const workflowTenantId = await resolveAuditWorkflowTenantId({
    auditId: audit?._id,
    fallbackTenantId: tenantId,
  });
  if (!workflowTenantId) return;
  await shiftMilestoneExpectedAt({
    auditId: audit._id,
    tenantId: workflowTenantId,
    deltaMs,
  });
};
const syncReservationBlocksForAudit = async ({ audit, actorId, timezone }) => {
  if (!audit) return;
  applyAuditReservationWindow({
    audit,
    durationDays: audit?.calendarDurationDays,
    anchorToAuditDate: true,
  });
  const normalizedTimezone = String(timezone || "UTC");
  const tasks = [];
  if (
    audit?.supplier_id &&
    String(audit?.supplierDecision || "").toUpperCase() !== "REJECTED"
  ) {
    tasks.push(
      upsertAuditReservationBlock({
        audit,
        ownerType: "supplier",
        ownerId: audit.supplier_id,
        actorId,
        timezone: normalizedTimezone,
      })
    );
  }
  if (
    audit?.auditor_id &&
    String(audit?.auditorDecision || "").toUpperCase() === "ACCEPTED"
  ) {
    tasks.push(
      upsertAuditReservationBlock({
        audit,
        ownerType: "auditor",
        ownerId: audit.auditor_id,
        actorId,
        timezone: normalizedTimezone,
      })
    );
  }
  if (tasks.length) {
    await Promise.all(tasks);
  }
};
const syncIntimationAuditFieldsForAuditor = async ({ artifact, data, audit, auditorName }) => {
  const nextData = data && typeof data === "object" ? { ...data } : {};
  const responses = toResponseMap(nextData.responses || []);
  const finalAuditDate = resolveEffectiveAuditDate({ audit, data: nextData });
  const finalAuditDateInput = toDateInputValue(finalAuditDate);
  const leadAuditorName = String(auditorName || "").trim();

  if (finalAuditDateInput) {
    nextData.finalDate = finalAuditDateInput;
    nextData.acceptedDate = finalAuditDateInput;
  }

  const signatures =
    nextData.signatures && typeof nextData.signatures === "object" ? { ...nextData.signatures } : {};
  if (leadAuditorName) {
    signatures.auditorName = leadAuditorName;
    nextData.signatures = signatures;
  }

  if (!artifact?.templateId) {
    responses.forEach((_value, questionId) => {
      const keyLabel = String(questionId || "");
      if (isIntimationCoAuditorLabel(keyLabel)) return;
      if (leadAuditorName && isIntimationLeadAuditorLabel(keyLabel)) {
        responses.set(questionId, leadAuditorName);
      }
      if (finalAuditDateInput && isIntimationScheduleDateLabel(keyLabel)) {
        responses.set(questionId, finalAuditDateInput);
      }
    });
    nextData.responses = fromResponseMap(responses);
    return nextData;
  }

  const questions = await TemplateQuestions.find({ templateId: artifact.templateId })
    .select("_id question")
    .lean();
  questions.forEach((question) => {
    const questionId = String(question?._id || "").trim();
    if (!questionId) return;
    const label = String(question?.question || "");
    if (isIntimationCoAuditorLabel(label)) return;
    if (leadAuditorName && isIntimationLeadAuditorLabel(label)) {
      responses.set(questionId, leadAuditorName);
    }
    if (finalAuditDateInput && isIntimationScheduleDateLabel(label)) {
      responses.set(questionId, finalAuditDateInput);
    }
  });
  responses.forEach((_value, questionId) => {
    const keyLabel = String(questionId || "");
    if (isIntimationCoAuditorLabel(keyLabel)) return;
    if (leadAuditorName && isIntimationLeadAuditorLabel(keyLabel)) {
      responses.set(questionId, leadAuditorName);
    }
    if (finalAuditDateInput && isIntimationScheduleDateLabel(keyLabel)) {
      responses.set(questionId, finalAuditDateInput);
    }
  });
  nextData.responses = fromResponseMap(responses);
  return nextData;
};

const toResponseMap = (responses = []) => {
  const map = new Map();
  if (!Array.isArray(responses)) return map;
  responses.forEach((entry) => {
    const questionId = String(entry?.questionId || "").trim();
    if (!questionId) return;
    map.set(questionId, entry?.value);
  });
  return map;
};

const fromResponseMap = (map) =>
  Array.from(map.entries()).map(([questionId, value]) => ({ questionId, value }));

const resolveScopeSupplierEditableQuestionIds = async (artifact) => {
  if (!artifact?.templateId) return new Set();
  const questions = await TemplateQuestions.find({ templateId: artifact.templateId })
    .select("_id question answerType")
    .lean();
  const ids = new Set();
  questions.forEach((question) => {
    const id = String(question?._id || "").trim();
    if (!id) return;
    const label = String(question?.question || "");
    const answerType = String(question?.answerType || "").toLowerCase();
    const canEdit =
      answerType === "signature" ||
      answerType === "date" ||
      scopeSignatureFieldPattern.test(label);
    if (canEdit) ids.add(id);
  });
  return ids;
};

const mergeAllowedIntimationAuditorSignature = (existingData, incomingData) => {
  const next = { ...(existingData || {}) };
  const incoming = incomingData && typeof incomingData === "object" ? incomingData : {};
  const existingSignatures =
    next.signatures && typeof next.signatures === "object" ? { ...next.signatures } : {};
  const incomingSignatures =
    incoming.signatures && typeof incoming.signatures === "object" ? incoming.signatures : {};
  if (Object.prototype.hasOwnProperty.call(incomingSignatures, "auditorName")) {
    existingSignatures.auditorName = incomingSignatures.auditorName;
  }
  if (Object.prototype.hasOwnProperty.call(incomingSignatures, "auditorSignedAt")) {
    existingSignatures.auditorSignedAt = incomingSignatures.auditorSignedAt;
  }
  next.signatures = existingSignatures;
  return next;
};

const mergeAllowedScopeSupplierSignature = (existingData, incomingData) => {
  const next = { ...(existingData || {}) };
  const incoming = incomingData && typeof incomingData === "object" ? incomingData : {};
  const existingSignatures =
    next.signatures && typeof next.signatures === "object" ? { ...next.signatures } : {};
  const incomingSignatures =
    incoming.signatures && typeof incoming.signatures === "object" ? incoming.signatures : {};
  if (Object.prototype.hasOwnProperty.call(incomingSignatures, "supplierName")) {
    existingSignatures.supplierName = incomingSignatures.supplierName;
  }
  if (Object.prototype.hasOwnProperty.call(incomingSignatures, "supplierSignedAt")) {
    existingSignatures.supplierSignedAt = incomingSignatures.supplierSignedAt;
  }
  next.signatures = existingSignatures;
  return next;
};

const canEditArtifact = (artifact, userRole) => {
  const normalized = normalizeRole(userRole);
  if (ADMIN_ROLES.has(normalized)) return true;
  if (artifact?.ownerRole && artifact.ownerRole === normalized) return true;
  if (
    artifact?.artifactType === "PRE_AUDIT_QUESTIONNAIRE" &&
    ["buyer", "supplier", "auditor"].includes(normalized)
  ) {
    return true;
  }
  if (artifact?.artifactType === "INTIMATION_LETTER" && normalized === "supplier") {
    return true;
  }
  if (artifact?.artifactType === "INTIMATION_LETTER" && normalized === "auditor") {
    return true;
  }
  if (
    ["SCOPE", "AGENDA"].includes(artifact?.artifactType) &&
    normalized === "auditor" &&
    String(artifact?.status || "").toLowerCase() !== "complete"
  ) {
    return true;
  }
  if (
    ["SCOPE", "AGENDA"].includes(artifact?.artifactType) &&
    normalized === "supplier" &&
    SCOPE_SUPPLIER_EDIT_STATUSES.has(String(artifact?.status || "").toLowerCase())
  ) {
    return true;
  }
  if (Array.isArray(artifact?.permissions) && artifact.permissions.includes(normalized)) return true;
  return false;
};

const normalizePhaseMap = (phases) => {
  if (!phases) return {};
  if (phases instanceof Map) return Object.fromEntries(phases);
  return phases;
};

const resolvePhaseStatus = async ({ audit, phaseKey, tenantId }) => {
  const resolvedTenantId = tenantId || audit?.tenantOrgId || null;
  if (!phaseKey) return null;
  const tracker = await PhaseTracker.findOne({
    tenantId: resolvedTenantId,
    workflowEntityId: audit._id,
    workflowEntityType: "AuditRequest",
  }).lean();
  if (tracker?.phases) {
    const trackerPhases = normalizePhaseMap(tracker.phases);
    return trackerPhases?.[phaseKey]?.status || null;
  }
  const auditPhases = normalizePhaseMap(audit?.phaseState?.phases);
  return auditPhases?.[phaseKey]?.status || null;
};

const isPhaseClosed = async ({ audit, phaseKey, tenantId }) => {
  const status = await resolvePhaseStatus({ audit, phaseKey, tenantId });
  return status === "COMPLETED";
};

const normalizeRole = (role) => {
  if (!role) return "";
  const normalized = String(role).toLowerCase();
  if (
    normalized === "supplieruser" ||
    normalized === "supplier_user" ||
    normalized === "supplier-user" ||
    normalized === "supplieradmin" ||
    normalized === "supplier_admin" ||
    normalized === "supplier-admin"
  ) {
    return "supplier";
  }
  if (normalized === "supplier") return "supplier";
  if (normalized === "auditor") return "auditor";
  if (normalized === "buyer") return "buyer";
  if (normalized === "admin" || normalized === "superadmin" || normalized === "tenant_admin") {
    return normalized;
  }
  return normalized;
};

const resolveTenantScopeId = (audit, reqTenantId) => {
  if (!audit) return reqTenantId ?? null;
  return audit.tenantOrgId ?? reqTenantId ?? null;
};

const buildTenantFilter = (tenantId) => {
  if (tenantId === null || tenantId === undefined) {
    return { tenantId: null };
  }
  return { tenantId: { $in: [tenantId, null] } };
};

const buildArtifactTenantFilter = (tenantId) => {
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    return {};
  }
  return buildTenantFilter(tenantId);
};

const canSendArtifact = (artifact, userRole) => {
  const normalized = normalizeRole(userRole);
  if (!artifact) return false;
  const status = String(artifact?.status || "").toLowerCase();
  if (["sent", "complete"].includes(status)) return false;
  if (ADMIN_ROLES.has(normalized)) return true;

  const artifactType = normalizeType(artifact?.artifactType);
  if (artifactType === "INTIMATION_LETTER") return normalized === "buyer";
  if (artifactType === "PRE_AUDIT_QUESTIONNAIRE") return normalized === "buyer" || normalized === "auditor";
  if (
    [
      "SCOPE",
      "AGENDA",
      "DRL",
      "EXECUTION_QUESTIONNAIRE",
      "GMP_CHECKLIST",
      "FINDINGS_LOG",
      "CAPA_PLAN",
      "FINAL_REPORT",
    ].includes(artifactType)
  ) {
    return normalized === "auditor";
  }
  return normalized === normalizeRole(artifact?.ownerRole);
};

const canViewArtifact = (artifact, userRole) => {
  if (!artifact) return false;
  const normalized = normalizeRole(userRole);
  if (ADMIN_ROLES.has(normalized) || normalized === "buyer" || normalized === "auditor") return true;
  if (normalized !== "supplier") return false;
  const status = String(artifact?.status || "").toLowerCase();
  const sentLike = ["sent", "complete"].includes(status);
  const artifactType = normalizeType(artifact?.artifactType);
  if (["SCOPE", "AGENDA", "INTIMATION_LETTER", "PRE_AUDIT_QUESTIONNAIRE"].includes(artifactType)) {
    return sentLike;
  }
  if (normalizeRole(artifact?.ownerRole) === "supplier") return true;
  if (SUPPLIER_FACING_ARTIFACT_TYPES.has(artifactType)) return sentLike;
  return false;
};

const canManageArtifactCatalog = (userRole) => {
  const normalized = normalizeRole(userRole);
  if (ADMIN_ROLES.has(normalized)) return true;
  return normalized === "buyer" || normalized === "auditor";
};

const resolveRecipientStrategy = (artifact) => {
  if (!artifact) return "assigned_auditor";
  if (artifact.ownerRole === "supplier") return "assigned_auditor";
  if (
    [
      "EXECUTION_QUESTIONNAIRE",
      "PRE_AUDIT_QUESTIONNAIRE",
      "DRL",
      "INTIMATION_LETTER",
      "SCOPE",
      "AGENDA",
    ].includes(artifact.artifactType)
  ) {
    return "supplier_owner";
  }
  return "assigned_auditor";
};

export const getAuditPhases = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const derived = !audit.phaseState;
    const phaseState = resolvePhaseState(audit);

    if (derived && req.query?.persist === "true") {
      audit.phaseState = phaseState;
      await audit.save();
    }

    return res.json({
      success: true,
      data: { phaseState, derived },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load audit phases" });
  }
};

export const transitionAuditPhase = async (req, res) => {
  try {
    const { toPhase, override = false, reason } = req.body || {};
    if (!toPhase || !AUDIT_PHASE_KEYS.includes(toPhase)) {
      return res.status(400).json({ error: "Invalid toPhase" });
    }

    const audit = await loadAudit(req);
    const phaseState = resolvePhaseState(audit);
    const fromPhase = phaseState.currentPhase || "INITIATED";
    const allowOverride = Boolean(override) && ADMIN_ROLES.has(req.user?.role);

    if (toPhase === fromPhase) {
      return res.json({ success: true, data: { phaseState } });
    }

    if (!allowOverride && !canTransition(fromPhase, toPhase)) {
      return res.status(400).json({ error: "Invalid phase transition" });
    }

    if (!allowOverride && ENABLE_PREP_PHASE && toPhase === "EXECUTION") {
      if (phaseState.phases?.PREP?.status !== "COMPLETED") {
        return res.status(400).json({ error: "PREP phase must be completed before Execution" });
      }
    }

    const updatedState = applyPhaseTransition(phaseState, toPhase);
    if (reason && updatedState.phases?.[toPhase]) {
      updatedState.phases[toPhase].meta = {
        ...(updatedState.phases[toPhase].meta || {}),
        transitionReason: reason,
      };
    }
    audit.phaseState = updatedState;
    await audit.save();

    await ensureArtifactsForPhase({ audit, phaseKey: toPhase, user: req.user, tenantId: req.tenantId });
    await writeAuditTrail({
      tenantId: audit.tenantOrgId || req.tenantId,
      auditId: audit._id,
      entityType: "phase",
      entityId: audit._id,
      action: "PHASE_TRANSITION",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { fromPhase, toPhase, reason, override: allowOverride },
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: audit.tenantOrgId || req.tenantId,
        auditId: audit._id,
        entityType: "phase",
        entityId: audit._id,
        action: "PHASE_TRANSITION",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: { currentPhase: fromPhase },
        after: { currentPhase: toPhase },
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
        meta: { reason, override: allowOverride },
      });
    }

    if (toPhase === "PREP") {
      await NotificationOrchestratorService.emitEvent(
        "audit.phase.prep_started",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Pre-audit prep started",
          message: "Please complete the pre-audit questionnaire and upload requested documents.",
          recipientStrategy: "supplier_owner",
          severity: "info",
        },
        { tenantId: audit.tenantOrgId, role: "supplier" }
      );
    }

    if (toPhase === "EXECUTION") {
      await NotificationOrchestratorService.emitEvent(
        "audit.phase.execution_started",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Execution phase started",
          message: "Execution phase is now active.",
          recipientStrategy: "supplier_owner",
          severity: "info",
        },
        { tenantId: audit.tenantOrgId, role: "supplier" }
      );
    }

    return res.json({ success: true, data: { phaseState: updatedState } });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to transition phase" });
  }
};

export const listAuditArtifacts = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = resolveTenantScopeId(audit, req.tenantId);
    const { phaseKey, artifactType, status, includeTemplateQuestions } = req.query || {};
    const filter = {
      auditId: audit._id,
    };
    Object.assign(filter, buildArtifactTenantFilter(tenantId));
    if (phaseKey) filter.phaseKey = phaseKey;
    if (artifactType) filter.artifactType = artifactType;
    if (status) filter.status = status;

    const resolvedPhaseKey = phaseKey || findPhaseForArtifact(artifactType);
    if (resolvedPhaseKey) {
      await ensureArtifactsForPhase({
        audit,
        phaseKey: resolvedPhaseKey,
        user: req.user,
        tenantId,
      });
    } else {
      await ensureArtifactsForAudit({
        audit,
        user: req.user,
        tenantId,
      });
    }

    const artifacts = await AuditArtifact.find(filter).sort({ updatedAt: -1 }).lean();
    const scoreArtifact = (artifact) => {
      let score = 0;
      if (artifact?.templateId) score += 10;
      const responseCount = Array.isArray(artifact?.data?.responses)
        ? artifact.data.responses.length
        : 0;
      if (responseCount) score += 8;
      if (artifact?.status === "sent") score += 6;
      if (artifact?.status === "complete") score += 5;
      if (artifact?.status === "in_progress") score += 3;
      if (artifact?.status === "draft") score += 1;
      const updatedAt = artifact?.updatedAt ? new Date(artifact.updatedAt).getTime() : 0;
      return score * 1000000000000 + updatedAt;
    };
    const dedupeArtifacts = (list = []) => {
      const grouped = new Map();
      list.forEach((artifact) => {
        const key = `${artifact.phaseKey || ""}:${artifact.artifactType || ""}`;
        const existing = grouped.get(key);
        if (!existing || scoreArtifact(artifact) > scoreArtifact(existing)) {
          grouped.set(key, artifact);
        }
      });
      return Array.from(grouped.values());
    };
    const dedupedArtifacts = dedupeArtifacts(artifacts);
    const visibleArtifacts = dedupedArtifacts.filter((item) => canViewArtifact(item, req.user?.role));
    if (visibleArtifacts.length) {
      const updated = [];
      for (const artifact of visibleArtifacts) {
        const resolved = await ensureArtifactTemplate({
          audit,
          artifact,
          tenantId,
          user: req.user,
        });
        updated.push(resolved);
      }
      if (includeTemplateQuestions === "true") {
        const templateIds = updated.map((a) => a.templateId).filter(Boolean);
        const questions = await TemplateQuestions.find({ templateId: { $in: templateIds } })
          .sort({ order: 1 })
          .lean();
        const grouped = new Map();
        questions.forEach((q) => {
          const list = grouped.get(q.templateId) || [];
          list.push(q);
          grouped.set(q.templateId, list);
        });
        const hydrated = updated.map((artifact) => ({
          ...artifact,
          templateQuestions: grouped.get(artifact.templateId) || [],
        }));
        return res.json({ success: true, data: hydrated });
      }
      return res.json({ success: true, data: updated });
    }

    if (includeTemplateQuestions === "true") {
      const templateIds = dedupedArtifacts.map((a) => a.templateId).filter(Boolean);
      const questions = await TemplateQuestions.find({ templateId: { $in: templateIds } })
        .sort({ order: 1 })
        .lean();
      const grouped = new Map();
      questions.forEach((q) => {
        const list = grouped.get(q.templateId) || [];
        list.push(q);
        grouped.set(q.templateId, list);
      });
      const hydrated = visibleArtifacts.map((artifact) => ({
        ...artifact,
        templateQuestions: grouped.get(artifact.templateId) || [],
      }));
      return res.json({ success: true, data: hydrated });
    }

    return res.json({ success: true, data: visibleArtifacts });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load artifacts" });
  }
};

export const getAuditArtifact = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = resolveTenantScopeId(audit, req.tenantId);
    let artifact = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      _id: req.params.artifactId,
    }).lean();
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    if (artifact.artifactType && !artifact.templateId) {
      const alt = await AuditArtifact.findOne({
        ...buildArtifactTenantFilter(tenantId),
        auditId: audit._id,
        phaseKey: artifact.phaseKey,
        artifactType: artifact.artifactType,
        templateId: { $ne: null },
      })
        .sort({ updatedAt: -1 })
        .lean();
      if (alt) {
        artifact = alt;
      }
    }
    if (!canViewArtifact(artifact, req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const resolved = await ensureArtifactTemplate({
      audit,
      artifact,
      tenantId,
      user: req.user,
    });
    return res.json({ success: true, data: resolved });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load artifact" });
  }
};

export const createAuditArtifact = async (req, res) => {
  try {
    const { phaseKey, artifactType, templateId, ownerRole, permissions, override, data } = req.body || {};
    if (!phaseKey || !AUDIT_PHASE_KEYS.includes(phaseKey)) {
      return res.status(400).json({ error: "Invalid phaseKey" });
    }
    if (!artifactType || !AUDIT_ARTIFACT_TYPES.includes(artifactType)) {
      return res.status(400).json({ error: "Invalid artifactType" });
    }
    const audit = await loadAudit(req);
    const tenantId = resolveTenantScopeId(audit, req.tenantId);
    const phaseClosed = await isPhaseClosed({ audit, phaseKey, tenantId });
    if (phaseClosed && !(override && ADMIN_ROLES.has(req.user?.role))) {
      return res.status(400).json({ error: "Phase is closed" });
    }

    const existing = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      phaseKey,
      artifactType,
    });
    if (existing) {
      const requiredByConfig = resolveArtifactRequiredFlag({ audit, artifactType, data: undefined });
      const requestedRequired =
        data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "required")
          ? Boolean(data.required)
          : null;
      if (requestedRequired === false && requiredByConfig) {
        return res.status(400).json({ error: "Required default artifacts cannot be marked optional" });
      }
      const existingData = existing.data && typeof existing.data === "object" ? { ...existing.data } : {};
      if (templateId) {
        const numericTemplateId = Number(templateId);
        if (Number.isNaN(numericTemplateId)) {
          return res.status(400).json({ error: "templateId must be numeric" });
        }

        if (!existing.templateId || Number(existing.templateId) !== numericTemplateId) {
          const template = await Template.findOne({ templateId: numericTemplateId }).lean();
          if (!template) {
            const templateQuestions = await TemplateQuestions.findOne({ templateId: numericTemplateId }).lean();
            if (!templateQuestions) {
              return res.status(400).json({ error: "Template not found" });
            }
          }

          const previousTemplateId = existing.templateId || null;
          existing.templateId = numericTemplateId;
          existing.data =
            artifactType === "PRE_AUDIT_QUESTIONNAIRE"
              ? {
                  ...existingData,
                  selectedTemplateIds: [numericTemplateId],
                  templateSelectionLocked: true,
                  templateSelectionPending: false,
                }
              : { ...existingData };
          existing.data.required =
            requestedRequired !== null ? requestedRequired : resolveArtifactRequiredFlag({ audit, artifactType, data: existing.data });
          existing.status = "draft";
          existing.updatedBy = req.user?._id;
          await existing.save();

          if (artifactType === "EXECUTION_QUESTIONNAIRE") {
            audit.selectedTemplateId = numericTemplateId;
            audit.isTempleteUsed = true;
            if (!audit.questionnaireStatus) {
              audit.questionnaireStatus = "request_received";
            }
            await audit.save();
          }

          await writeAuditTrail({
            tenantId,
            auditId: audit._id,
            entityType: "artifact",
            entityId: existing._id,
            action: "ARTIFACT_TEMPLATE_SELECTED",
            actorId: req.user?._id,
            actorRole: req.user?.role,
            meta: {
              phaseKey,
              artifactType,
              templateId: numericTemplateId,
              previousTemplateId,
            },
          });
          if (ENABLE_AUDIT_EVENT_LOG) {
            await writeAuditEvent({
              tenantId,
              auditId: audit._id,
              entityType: "artifact",
              entityId: existing._id,
              action: "ARTIFACT_TEMPLATE_SELECTED",
              actorId: req.user?._id,
              actorRole: req.user?.role,
              before: { templateId: previousTemplateId },
              after: { templateId: numericTemplateId },
              ip: req.ip,
              userAgent: req.get?.("user-agent"),
              meta: { phaseKey, artifactType },
            });
          }
        }
      }
      if (requestedRequired !== null) {
        const nextExistingData = existing.data && typeof existing.data === "object" ? { ...existing.data } : {};
        if (nextExistingData.required !== requestedRequired) {
          nextExistingData.required = requestedRequired;
          existing.data = nextExistingData;
          existing.updatedBy = req.user?._id;
          await existing.save();
        }
      }
      if (artifactType === "INTIMATION_LETTER") {
        const seeded = applyIntimationSignatureDefaults(existing.data);
        if (seeded.changed) {
          existing.data = seeded.data;
          existing.updatedBy = req.user?._id;
          await existing.save();
        }
      }
      return res.json({ success: true, data: existing });
    }

    let resolvedTemplateId = templateId ? Number(templateId) : null;
    if (templateId) {
      const template = await Template.findOne({ templateId: resolvedTemplateId }).lean();
      if (!template) {
        const templateQuestions = await TemplateQuestions.findOne({ templateId: resolvedTemplateId }).lean();
        if (!templateQuestions) {
          return res.status(400).json({ error: "Template not found" });
        }
      }
    }

    let nextData = data && typeof data === "object" ? { ...data } : {};
    const requiredByConfig = resolveArtifactRequiredFlag({ audit, artifactType, data: undefined });
    const requestedRequired =
      data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "required")
        ? Boolean(data.required)
        : null;
    if (requestedRequired === false && requiredByConfig) {
      return res.status(400).json({ error: "Required default artifacts cannot be marked optional" });
    }
    nextData.required =
      requestedRequired !== null ? requestedRequired : resolveArtifactRequiredFlag({ audit, artifactType, data: nextData });
    if (artifactType === "INTIMATION_LETTER") {
      nextData = applyIntimationSignatureDefaults(nextData).data;
    }

    if (!resolvedTemplateId) {
      try {
        const { resolveDefaultTemplateId } = await import("../utils/templateDefaults.js");
        const fallbackTemplateId = await resolveDefaultTemplateId({
          artifactType,
          tenantId,
          assessmentTypeId: audit.assessmentTypeId,
        });
        if (fallbackTemplateId) resolvedTemplateId = Number(fallbackTemplateId);
      } catch (err) {
        console.warn("resolveDefaultTemplateId failed", err?.message || err);
      }
    }

    if (artifactType === "PRE_AUDIT_QUESTIONNAIRE") {
      const templateQuery = {
        status: "PUBLISHED",
        archiveFlag: { $ne: true },
        $or: [{ templateType: "PRE_AUDIT_Q" }, { artifactType: "PRE_AUDIT_QUESTIONNAIRE" }],
      };
      if (tenantId) {
        templateQuery.$and = [
          {
            $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
          },
        ];
      }
      if (audit.assessmentTypeId) {
        templateQuery.$and = [
          ...(templateQuery.$and || []),
          {
            $or: [
              { assessmentTypeId: audit.assessmentTypeId },
              { assessmentTypeId: null },
              { assessmentTypeId: { $exists: false } },
            ],
          },
        ];
      }
      const paqTemplates = await Template.find(templateQuery)
        .sort({ "extractionConfig.defaultTemplate": -1, templateId: 1 })
        .select("templateId")
        .lean();
      const paqTemplateIds = paqTemplates
        .map((tpl) => Number(tpl.templateId))
        .filter((id) => Number.isFinite(id));
      if (paqTemplateIds.length) {
        if (!resolvedTemplateId) resolvedTemplateId = paqTemplateIds[0];
        const activeTemplateId = Number(resolvedTemplateId);
        const hasActiveTemplate = Number.isFinite(activeTemplateId);
        nextData.selectedTemplateIds = hasActiveTemplate ? [activeTemplateId] : paqTemplateIds;
        nextData.templateSelectionLocked = hasActiveTemplate;
        nextData.templateSelectionPending = !hasActiveTemplate && paqTemplateIds.length > 1;
      }
    }

    const record = await AuditArtifact.create({
      tenantId,
      auditId: audit._id,
      phaseKey,
      artifactType,
      templateId: resolvedTemplateId || null,
      data: nextData,
      ownerRole: ownerRole || artifactOwners[artifactType] || null,
      permissions: Array.isArray(permissions) ? permissions : [],
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    await AuditArtifactVersion.create({
      tenantId,
      auditId: audit._id,
      artifactId: record._id,
      version: record.version || 1,
      status: record.status,
      templateId: record.templateId,
      data: record.data || {},
      signatures: record.data?.signatures || [],
      createdBy: req.user?._id,
    });

    if (artifactType === "EXECUTION_QUESTIONNAIRE" && templateId) {
      const selectedTemplateId = Number(templateId);
      audit.selectedTemplateId = selectedTemplateId;
      audit.isTempleteUsed = true;
      if (!audit.questionnaireStatus) {
        audit.questionnaireStatus = "request_received";
      }
      await audit.save();
    }
    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "artifact",
      entityId: record._id,
      action: "ARTIFACT_CREATED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { phaseKey, artifactType, templateId: record.templateId },
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "artifact",
        entityId: record._id,
        action: "ARTIFACT_CREATED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        after: { templateId: record.templateId, status: record.status },
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
        meta: { phaseKey, artifactType },
      });
    }

    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to create artifact" });
  }
};

export const deleteAuditArtifact = async (req, res) => {
  try {
    const { override = false } = req.body || {};
    const audit = await loadAudit(req);
    const tenantId = resolveTenantScopeId(audit, req.tenantId);
    const artifact = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      _id: req.params.artifactId,
    });
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    if (!canManageArtifactCatalog(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const phaseClosed = await isPhaseClosed({ audit, phaseKey: artifact.phaseKey, tenantId });
    if (phaseClosed && !(override && ADMIN_ROLES.has(req.user?.role))) {
      return res.status(400).json({ error: "Phase is closed" });
    }

    const requiredByConfig = resolveArtifactRequiredFlag({
      audit,
      artifactType: artifact.artifactType,
      data: undefined,
    });
    const required = resolveArtifactRequiredFlag({
      audit,
      artifactType: artifact.artifactType,
      data: artifact.data,
    });
    if (requiredByConfig && required) {
      return res.status(400).json({ error: "Required default artifacts cannot be deleted" });
    }

    const previousSnapshot = {
      phaseKey: artifact.phaseKey,
      artifactType: artifact.artifactType,
      status: artifact.status,
      templateId: artifact.templateId || null,
    };

    await AuditArtifactVersion.deleteMany({
      tenantId,
      auditId: audit._id,
      artifactId: artifact._id,
    });
    await artifact.deleteOne();

    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "artifact",
      entityId: req.params.artifactId,
      action: "ARTIFACT_DELETED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: {
        phaseKey: previousSnapshot.phaseKey,
        artifactType: previousSnapshot.artifactType,
      },
    });

    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "artifact",
        entityId: req.params.artifactId,
        action: "ARTIFACT_DELETED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: previousSnapshot,
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
      });
    }

    return res.json({ success: true });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to delete artifact" });
  }
};

export const submitAuditArtifact = async (req, res) => {
  try {
    const { responses, data, submit, status, override } = req.body || {};
    const audit = await loadAudit(req);
    const tenantId = resolveTenantScopeId(audit, req.tenantId);
    const artifact = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      _id: req.params.artifactId,
    });
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    const previousSnapshot = {
      status: artifact.status,
      version: artifact.version,
    };
    const actorUsername = resolveActorUsername(req.user);
    const changedFields = [];
    if (Array.isArray(responses)) {
      changedFields.push("data.responses");
    }
    if (data && typeof data === "object") {
      Object.keys(data).forEach((key) => changedFields.push(`data.${key}`));
    }
    if (submit || status) {
      changedFields.push("status");
    }
    const normalizedRole = normalizeRole(req.user?.role);
    const isBuyerRole = ["buyer", "admin", "superadmin", "tenant_admin"].includes(normalizedRole);
    const isSupplierRole = normalizedRole === "supplier";
    const isAuditorRole = normalizedRole === "auditor";
    const isIntimation = artifact.artifactType === "INTIMATION_LETTER";
    const isScopeArtifact = ["SCOPE", "AGENDA"].includes(artifact.artifactType);
    const intimationSignoffLocked = isIntimation && isIntimationSignoffLocked(artifact);
    const allowClosedPhaseIntimationAuditorSignoff = isIntimation && isAuditorRole;
    const phaseClosed = await isPhaseClosed({ audit, phaseKey: artifact.phaseKey, tenantId });
    if (
      phaseClosed &&
      !(override && ADMIN_ROLES.has(req.user?.role)) &&
      !allowClosedPhaseIntimationAuditorSignoff
    ) {
      return res.status(400).json({ error: "Phase is closed" });
    }
    if (intimationSignoffLocked && !ADMIN_ROLES.has(normalizedRole)) {
      return res.status(400).json({
        error: "Intimation letter is locked after all signatures were completed",
      });
    }

    if (!canEditArtifact(artifact, req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let nextData = { ...(artifact.data || {}) };
    if (isIntimation && isAuditorRole && !ADMIN_ROLES.has(normalizedRole)) {
      nextData = mergeAllowedIntimationAuditorSignature(nextData, data);
    } else if (isScopeArtifact && isSupplierRole && !ADMIN_ROLES.has(normalizedRole)) {
      nextData = mergeAllowedScopeSupplierSignature(nextData, data);
    } else if (data && typeof data === "object") {
      Object.assign(nextData, data);
    }
    if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "templateId")) {
      const incomingTemplateId = Number(data.templateId);
      if (Number.isFinite(incomingTemplateId)) {
        const template = await Template.findOne({ templateId: incomingTemplateId })
          .select("templateId templateType artifactType")
          .lean();
        if (!template || !isTemplateCompatible({ artifactType: artifact.artifactType, template })) {
          return res.status(400).json({ error: "Selected template is not compatible with this artifact" });
        }
        const previousTemplateId = Number(artifact.templateId);
        if (!Number.isNaN(previousTemplateId) && previousTemplateId !== incomingTemplateId) {
          nextData.responses = [];
        }
        artifact.templateId = incomingTemplateId;
      }
    }
    if (artifact.artifactType === "PRE_AUDIT_QUESTIONNAIRE" && data && typeof data === "object") {
      const incomingTemplateId = Number(data.templateId || artifact.templateId);
      if (Number.isFinite(incomingTemplateId)) {
        const lockSelection = data.templateSelectionLocked !== false;
        const selectedIds = Array.isArray(nextData.selectedTemplateIds)
          ? nextData.selectedTemplateIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
          : [];
        const selected = new Set(selectedIds);
        selected.add(incomingTemplateId);
        nextData.selectedTemplateIds = lockSelection ? [incomingTemplateId] : Array.from(selected);
        nextData.templateSelectionLocked = lockSelection;
        nextData.templateSelectionPending = lockSelection ? false : selected.size > 1;
        if (lockSelection) {
          nextData.templateSelectionLockedAt = new Date();
          nextData.templateSelectionLockedBy = req.user?._id;
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(nextData, "templateId")) {
      delete nextData.templateId;
    }
    const existingSupplierDecision = String(
      nextData?.supplierDecision || artifact?.data?.supplierDecision || ""
    ).toUpperCase();
    const supplierDecisionLocked = Boolean(
      existingSupplierDecision &&
        existingSupplierDecision !== "PENDING" &&
        existingSupplierDecision !== "NOT_SET"
    );
    const allowResponseUpdate =
      !isIntimation ||
      ADMIN_ROLES.has(normalizedRole) ||
      (isBuyerRole && artifact.status !== "sent") ||
      (isSupplierRole && artifact.status === "sent" && !supplierDecisionLocked) ||
      isAuditorRole;
    if (Array.isArray(responses) && allowResponseUpdate) {
      if (isScopeArtifact && isSupplierRole && !ADMIN_ROLES.has(normalizedRole)) {
        const editableQuestionIds = await resolveScopeSupplierEditableQuestionIds(artifact);
        const responseMap = toResponseMap(nextData.responses || artifact?.data?.responses || []);
        responses.forEach((entry) => {
          const questionId = String(entry?.questionId || "").trim();
          if (!questionId) return;
          const canEdit =
            editableQuestionIds.has(questionId) || scopeSignatureFieldPattern.test(questionId);
          if (!canEdit) return;
          responseMap.set(questionId, entry?.value);
        });
        nextData.responses = fromResponseMap(responseMap);
      } else if (isIntimation && isAuditorRole && !ADMIN_ROLES.has(normalizedRole)) {
        const editableQuestionIds = await resolveIntimationAuditorEditableQuestionIds(artifact);
        const responseMap = toResponseMap(nextData.responses || artifact?.data?.responses || []);
        responses.forEach((entry) => {
          const questionId = String(entry?.questionId || "").trim();
          if (!questionId) return;
          const canEdit =
            editableQuestionIds.has(questionId) || isIntimationCoAuditorLabel(questionId);
          if (!canEdit) return;
          responseMap.set(questionId, entry?.value);
        });
        nextData.responses = fromResponseMap(responseMap);
      } else {
        nextData.responses = responses;
      }
    }
    if (isIntimation && isAuditorRole && !ADMIN_ROLES.has(normalizedRole)) {
      const fallbackAuditorName = String(
        nextData?.signatures?.auditorName || resolveActorUsername(req.user)
      ).trim();
      nextData = await syncIntimationAuditFieldsForAuditor({
        artifact,
        data: nextData,
        audit,
        auditorName: fallbackAuditorName,
      });
    }

    if (isIntimation) {
      if (status) {
        artifact.status = status;
      } else if (submit) {
        if (isSupplierRole) {
          artifact.status = "sent";
        } else if (isBuyerRole && nextData?.finalized) {
          artifact.status = "complete";
        } else if (artifact.status === "draft") {
          artifact.status = "in_progress";
        }
      } else if (artifact.status === "draft") {
        artifact.status = "in_progress";
      }
    } else if (submit) {
      artifact.status = "complete";
    } else if (status) {
      artifact.status = status;
    } else if (artifact.status === "draft") {
      artifact.status = "in_progress";
    }

    const shouldLockIntimation =
      isIntimation &&
      hasAllIntimationSignatures(
        nextData?.signatures && typeof nextData.signatures === "object"
          ? nextData.signatures
          : {}
      );
    if (shouldLockIntimation) {
      nextData = applyIntimationSignoffLock({ data: nextData, actorId: req.user?._id });
      artifact.status = "complete";
      changedFields.push("data.signaturesLockedAt", "data.signaturesLockedBy");
    }

    artifact.data = nextData;

    const nextVersion = (artifact.version || 1) + 1;
    artifact.version = nextVersion;
    artifact.updatedBy = req.user?._id;
    await artifact.save();
    changedFields.push("version");
    if (!changedFields.length) {
      changedFields.push("data");
    }
    await AuditArtifactVersion.create({
      tenantId,
      auditId: audit._id,
      artifactId: artifact._id,
      version: nextVersion,
      status: artifact.status,
      templateId: artifact.templateId,
      data: artifact.data || {},
      signatures: artifact.data?.signatures || [],
      createdBy: req.user?._id,
    });
    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "artifact",
      entityId: artifact._id,
      action: submit ? "ARTIFACT_SUBMITTED" : "ARTIFACT_UPDATED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: {
        phaseKey: artifact.phaseKey,
        artifactType: artifact.artifactType,
        status: artifact.status,
        actorUsername,
        changeBrief: buildChangeBrief({
          collection: "audit-artifacts",
          fields: changedFields,
        }),
      },
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "artifact",
        entityId: artifact._id,
        action: submit ? "ARTIFACT_SUBMITTED" : "ARTIFACT_UPDATED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: previousSnapshot,
        after: { status: artifact.status, version: artifact.version },
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
        meta: {
          phaseKey: artifact.phaseKey,
          artifactType: artifact.artifactType,
          actorUsername,
          changeBrief: buildChangeBrief({
            collection: "audit-artifacts",
            fields: changedFields,
          }),
        },
      });
    }

    const trackingTenantId = tenantId || audit.tenantOrgId || null;

    if (submit && artifact.ownerRole === "supplier") {
      const submittedRecipientStrategy =
        artifact.artifactType === "PRE_AUDIT_QUESTIONNAIRE" ? "buyer_owner" : "assigned_auditor";
      const submittedRole = artifact.artifactType === "PRE_AUDIT_QUESTIONNAIRE" ? "buyer" : "auditor";
      await NotificationOrchestratorService.emitEvent(
        "audit.artifact.submitted",
        {
          entityType: "audit",
          entityId: audit._id,
          title: `Audit ID: ${resolveAuditLabel(audit)} - ${artifact.artifactType} submitted`,
          message: `Artifact ${artifact.artifactType} was submitted.`,
          recipientStrategy: submittedRecipientStrategy,
          severity: "info",
        },
        { tenantId: audit.tenantOrgId, role: submittedRole }
      );
    }

    if (submit && artifact.artifactType === "PRE_AUDIT_QUESTIONNAIRE" && isSupplierRole && trackingTenantId) {
      await advanceMilestone({
        tenantId: trackingTenantId,
        auditId: audit._id,
        code: MILESTONE_CODES.PAQ_RESPONDED,
        desiredStatus: "COMPLETED",
      });
    }

    if (submit && isIntimation && isSupplierRole) {
      const decisionRaw = nextData?.supplierDecision || "";
      const decision = String(decisionRaw || "").toUpperCase();
      const proposedDates = Array.isArray(nextData?.proposedDates)
        ? nextData.proposedDates.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()))
        : [];
      const previousEta = audit.auditETA || audit.complianceDate || null;
      let nextEta = null;

      if (decision === "REJECTED" || decision === "DECLINED") {
        audit.supplierDecision = "REJECTED";
        audit.supplierRejectionReason = nextData?.supplierDecisionNote || "Supplier declined";
        audit.trackStatus = "Supplier declined intimation";
        audit.nextAuditOn = "buyer";
      } else if (decision === "PROPOSED") {
        audit.supplierDecision = "PROPOSED";
        audit.supplierRejectionReason = null;
        audit.trackStatus = "Supplier proposed schedule";
        audit.nextAuditOn = "buyer";
      } else {
        // BUG#2 fix: do NOT set audit.supplierDecision here. Intimation
        // acceptance is a separate handshake from audit acceptance — the
        // latter is set only by POST /api/audit-requests/:id/supplier-decision.
        // Conflating the two showed "Audit accepted by supplier" in tracking
        // when the supplier had only accepted the intimation letter.
        audit.supplierIntimationAcceptedAt = new Date();
        audit.trackStatus = "Intimation acknowledged";
        audit.nextAuditOn = "buyer";
      }
      audit.supplierDecisionAt = new Date();
      audit.supplierDecisionBy = req.user?._id;
      if (proposedDates.length) {
        audit.supplierProposedDates = proposedDates;
        const primaryProposedDate = proposedDates[0] || null;
        if (primaryProposedDate) {
          audit.auditETA = primaryProposedDate;
          audit.complianceDate = primaryProposedDate;
          nextEta = primaryProposedDate;
          applyAuditReservationWindow({
            audit,
            durationDays: audit?.calendarDurationDays,
            anchorToAuditDate: true,
          });
        }
      }
      artifact.data = {
        ...(artifact.data || {}),
        supplierDecision: audit.supplierDecision,
        proposedDates: proposedDates.length ? proposedDates.map((d) => d.toISOString()) : undefined,
      };
      await artifact.save();
      await audit.save();
      if (nextEta) {
        await shiftMilestonesForEtaChange({
          audit,
          tenantId,
          previousEta,
          nextEta,
        });
        await syncReservationBlocksForAudit({
          audit,
          actorId: req.user?._id,
          timezone: req.body?.timezone,
        });
      }
      if (trackingTenantId && audit.supplierDecision !== "REJECTED") {
        await advanceMilestone({
          tenantId: trackingTenantId,
          auditId: audit._id,
          code: MILESTONE_CODES.SUPPLIER_INTIMATION_ACCEPTED,
          desiredStatus: "COMPLETED",
        });
      }

      const subjectPrefix = `Audit ID: ${resolveAuditLabel(audit)}`;
      await NotificationOrchestratorService.emitEvent(
        "audit.intimation.response",
        {
          entityType: "audit",
          entityId: audit._id,
          title: `${subjectPrefix} - Supplier response received`,
          message:
            audit.supplierDecision === "PROPOSED"
              ? "Supplier proposed new schedule options."
              : audit.supplierDecision === "REJECTED"
                ? "Supplier declined the intimation letter."
                : "Supplier accepted the intimation letter.",
          recipientStrategy: "buyer_owner",
          severity: "info",
        },
        { tenantId: audit.tenantOrgId, role: "buyer" }
      );
    }

    if (submit && isIntimation && isBuyerRole) {
      const buyerDecision = String(nextData?.buyerDecision || "").toUpperCase();
      if (buyerDecision === "ACCEPTED") {
        const supplierProposedFallback = resolvePrimaryProposedDate(audit?.supplierProposedDates);
        const finalDateRaw =
          nextData?.finalDate ||
          nextData?.acceptedDate ||
          (supplierProposedFallback ? supplierProposedFallback.toISOString() : "");
        const parsedFinal = finalDateRaw ? new Date(finalDateRaw) : null;
        const validFinal = parsedFinal && !Number.isNaN(parsedFinal.getTime()) ? parsedFinal : null;
        const previousEta = audit.auditETA || audit.complianceDate || null;
        if (validFinal) {
          audit.auditETA = validFinal;
          audit.complianceDate = validFinal;
          applyAuditReservationWindow({
            audit,
            durationDays: audit?.calendarDurationDays,
            anchorToAuditDate: true,
          });
        }
        audit.trackStatus = "Audit schedule confirmed";
        audit.nextAuditOn = "buyer";
        await audit.save();

        if (validFinal) {
          await shiftMilestonesForEtaChange({
            audit,
            tenantId,
            previousEta,
            nextEta: validFinal,
          });
          await syncReservationBlocksForAudit({
            audit,
            actorId: req.user?._id,
            timezone: req.body?.timezone,
          });
        }
        artifact.data = {
          ...(artifact.data || {}),
          finalized: true,
          finalizedAt: new Date(),
          finalDate: validFinal ? validFinal.toISOString() : finalDateRaw,
        };
        artifact.status = "complete";
        artifact.updatedBy = req.user?._id;
        await artifact.save();
      } else if (artifact.status !== "sent" && !nextData?.buyerDecision) {
        artifact.status = "sent";
        artifact.updatedBy = req.user?._id;
        await artifact.save();
        await applyIntimationSent({ audit, artifact, tenantId, actorId: req.user?._id });
        await NotificationOrchestratorService.emitEvent(
          "audit.intimation.sent",
          {
            entityType: "audit",
            entityId: audit._id,
            title: `Audit ID: ${resolveAuditLabel(audit)} - Intimation letter sent`,
            message: "Please review the intimation letter and propose audit dates.",
            recipientStrategy: "supplier_owner",
            severity: "info",
          },
          { tenantId: audit.tenantOrgId, role: "supplier" }
        );
      }
    }

    if (submit && isScopeArtifact && isSupplierRole) {
      const now = new Date();
      artifact.data = {
        ...(artifact.data || {}),
        confirmed: true,
        confirmedAt: now,
        confirmedBy: req.user?._id,
      };
      artifact.updatedBy = req.user?._id;
      await artifact.save();
      const scopeAgendaSignoff = await resolveScopeAgendaSupplierSignoff({ audit, tenantId });
      if (scopeAgendaSignoff.ready) {
        const phaseState = resolvePhaseState(audit);
        let updatedPhaseState = false;
        if (phaseState.phases?.PREP && phaseState.phases.PREP.status !== "COMPLETED") {
          phaseState.phases.PREP.status = "COMPLETED";
          phaseState.phases.PREP.completedAt = phaseState.phases.PREP.completedAt || now;
          phaseState.phases.PREP.startedAt = phaseState.phases.PREP.startedAt || now;
          phaseState.phases.PREP.blockers = [];
          phaseState.phases.PREP.meta = {
            ...(phaseState.phases.PREP.meta || {}),
            completedByScopeSignoff: true,
          };
          updatedPhaseState = true;
        }
        if (phaseState.phases?.PLANNING && phaseState.phases.PLANNING.status !== "IN_PROGRESS") {
          phaseState.phases.PLANNING.status = "IN_PROGRESS";
          phaseState.phases.PLANNING.startedAt = phaseState.phases.PLANNING.startedAt || now;
          phaseState.phases.PLANNING.blockers = [];
          updatedPhaseState = true;
        }
        if (phaseState.currentPhase !== "PLANNING") {
          phaseState.currentPhase = "PLANNING";
          updatedPhaseState = true;
        }

        if (updatedPhaseState) {
          audit.phaseState = phaseState;
        }
        audit.trackStatus = "Preparation completed";
        audit.nextAuditOn = "auditor";
        await audit.save();
        await ensureArtifactsForPhase({ audit, phaseKey: "PLANNING", user: req.user, tenantId: req.tenantId });

        const trackingTenantId = tenantId || audit.tenantOrgId || null;
        if (trackingTenantId) {
          const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId: trackingTenantId });
          if (assessmentType) {
            const tracker = await ensurePhaseTracker({ audit, assessmentType, tenantId: trackingTenantId });
            if (tracker) {
              const phases = tracker.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker.phases || {};
              let trackerUpdated = false;
              if (phases.PREP && phases.PREP.status !== "COMPLETED") {
                phases.PREP.status = "COMPLETED";
                phases.PREP.completedAt = phases.PREP.completedAt || now;
                phases.PREP.startedAt = phases.PREP.startedAt || now;
                phases.PREP.blockers = [];
                trackerUpdated = true;
              }
              if (phases.PLANNING && phases.PLANNING.status !== "IN_PROGRESS") {
                phases.PLANNING.status = "IN_PROGRESS";
                phases.PLANNING.startedAt = phases.PLANNING.startedAt || now;
                phases.PLANNING.blockers = [];
                trackerUpdated = true;
              }
              if (tracker.currentPhaseKey !== "PLANNING") {
                tracker.currentPhaseKey = "PLANNING";
                trackerUpdated = true;
              }
              if (trackerUpdated) {
                tracker.phases = phases;
                await tracker.save();
              }
            }
          }
          await advanceMilestone({
            tenantId: trackingTenantId,
            auditId: audit._id,
            code: MILESTONE_CODES.SUPPLIER_SCOPE_AGENDA_SIGNED,
            desiredStatus: "COMPLETED",
          });
        }
      } else {
        audit.trackStatus = "Preparation in progress";
        audit.nextAuditOn = "supplier";
        await audit.save();
      }
    }

    return res.json({ success: true, data: artifact });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to submit artifact" });
  }
};

export const sendAuditArtifact = async (req, res) => {
  try {
    const { override = false, sendPaq = false } = req.body || {};
    const audit = await loadAudit(req);
    const tenantId = resolveTenantScopeId(audit, req.tenantId);
    const artifact = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      _id: req.params.artifactId,
    });
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    const actorUsername = resolveActorUsername(req.user);
    const sentChangeFields = ["status", "version"];
    const previousStatus = artifact.status;
    const previousVersion = artifact.version || 1;
    const phaseClosed = await isPhaseClosed({ audit, phaseKey: artifact.phaseKey, tenantId });
    if (phaseClosed && !(override && ADMIN_ROLES.has(req.user?.role))) {
      return res.status(400).json({ error: "Phase is closed" });
    }
    if (["sent", "complete"].includes(String(artifact.status || "").toLowerCase())) {
      return res.status(400).json({ error: "Artifact is already sent" });
    }

    if (!canSendArtifact(artifact, req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (artifact.artifactType === "PRE_AUDIT_QUESTIONNAIRE" && !artifact.templateId) {
      return res.status(400).json({
        error: "Select a PAQ template before sending it to the supplier.",
        code: "PAQ_TEMPLATE_REQUIRED",
        paqArtifactId: artifact._id,
      });
    }

    // Allow sending intimation letters even without a template so attachments-only flow works.
    if (["SCOPE", "AGENDA"].includes(artifact.artifactType)) {
      if (String(artifact.status || "").toLowerCase() === "complete") {
        return res.status(400).json({ error: "Scope/Agenda is already finalized" });
      }
      const signatures =
        artifact?.data?.signatures && typeof artifact.data.signatures === "object"
          ? artifact.data.signatures
          : {};
      const hasAuditorSignoff = hasRoleSignature(signatures, "auditor", { allowPlaceholder: false });
      if (!hasAuditorSignoff) {
        return res.status(400).json({ error: "Auditor signature is required before sending Scope/Agenda" });
      }
    }

    let scopeAgendaSignoff = null;
    if (artifact.artifactType === "EXECUTION_QUESTIONNAIRE" && !override) {
      scopeAgendaSignoff = await resolveScopeAgendaSupplierSignoff({ audit, tenantId });
      if (!scopeAgendaSignoff.ready) {
        const missing = scopeAgendaSignoff.missing.join(", ");
        return res.status(400).json({
          error: `Execution questionnaire can be sent only after supplier signs Scope and Agenda. Missing: ${missing}`,
          code: "SCOPE_AGENDA_SIGNATURE_REQUIRED",
          details: scopeAgendaSignoff,
        });
      }
    }

    if (
      ENABLE_PREP_PHASE &&
      !ALLOW_EARLY_ARTIFACT_SEND &&
      artifact.artifactType === "EXECUTION_QUESTIONNAIRE" &&
      !override
    ) {
      const phaseState = resolvePhaseState(audit);
      const prepCompleted = phaseState.phases?.PREP?.status === "COMPLETED";
      if (!prepCompleted && !scopeAgendaSignoff?.ready) {
        return res.status(400).json({ error: "PREP phase must be completed before sending execution questionnaire" });
      }
    }

    let paqArtifactForCascade = null;
    if (artifact.artifactType === "INTIMATION_LETTER" && sendPaq) {
      paqArtifactForCascade = await AuditArtifact.findOne({
        ...buildArtifactTenantFilter(tenantId),
        auditId: audit._id,
        artifactType: "PRE_AUDIT_QUESTIONNAIRE",
      });
      if (!paqArtifactForCascade) {
        return res.status(400).json({
          error: "Pre-Audit Questionnaire artifact is not available. Create PAQ first.",
        });
      }
      if (!paqArtifactForCascade.templateId) {
        return res.status(400).json({
          error: "Select a PAQ template before sending it to the supplier.",
          code: "PAQ_TEMPLATE_REQUIRED",
          paqArtifactId: paqArtifactForCascade._id,
        });
      }
      if (["sent", "complete"].includes(String(paqArtifactForCascade.status || "").toLowerCase())) {
        paqArtifactForCascade = null;
      }
    }

    const nextVersion = (artifact.version || 1) + 1;
    artifact.status = "sent";
    artifact.version = nextVersion;
    artifact.updatedBy = req.user?._id;
    await artifact.save();
    await AuditArtifactVersion.create({
      tenantId,
      auditId: audit._id,
      artifactId: artifact._id,
      version: nextVersion,
      status: artifact.status,
      templateId: artifact.templateId,
      data: artifact.data || {},
      signatures: artifact.data?.signatures || [],
      createdBy: req.user?._id,
    });

    const recipientStrategy = resolveRecipientStrategy(artifact);

    if (artifact.artifactType === "EXECUTION_QUESTIONNAIRE") {
      const now = new Date();
      audit.questionnaireStatus = "sent_to_supplier";
      audit.trackStatus = "Request sent to Supplier";
      audit.nextAuditOn = "supplier";
      const phaseState = resolvePhaseState(audit);
      let phaseUpdated = false;
      if (phaseState.phases?.PREP && phaseState.phases.PREP.status !== "COMPLETED") {
        phaseState.phases.PREP.status = "COMPLETED";
        phaseState.phases.PREP.completedAt = phaseState.phases.PREP.completedAt || now;
        phaseState.phases.PREP.startedAt = phaseState.phases.PREP.startedAt || now;
        phaseState.phases.PREP.blockers = [];
        phaseUpdated = true;
      }
      if (phaseState.phases?.PLANNING && phaseState.phases.PLANNING.status !== "COMPLETED") {
        phaseState.phases.PLANNING.status = "COMPLETED";
        phaseState.phases.PLANNING.completedAt = phaseState.phases.PLANNING.completedAt || now;
        phaseState.phases.PLANNING.startedAt = phaseState.phases.PLANNING.startedAt || now;
        phaseState.phases.PLANNING.blockers = [];
        phaseUpdated = true;
      }
      if (phaseState.phases?.EXECUTION && phaseState.phases.EXECUTION.status !== "IN_PROGRESS") {
        phaseState.phases.EXECUTION.status = "IN_PROGRESS";
        phaseState.phases.EXECUTION.startedAt = phaseState.phases.EXECUTION.startedAt || now;
        phaseState.phases.EXECUTION.blockers = [];
        phaseUpdated = true;
      }
      if (phaseState.currentPhase !== "EXECUTION") {
        phaseState.currentPhase = "EXECUTION";
        phaseUpdated = true;
      }
      if (phaseUpdated) {
        audit.phaseState = phaseState;
        sentChangeFields.push(
          "audit.phaseState.currentPhase",
          "audit.phaseState.phases.PREP.status",
          "audit.phaseState.phases.PLANNING.status",
          "audit.phaseState.phases.EXECUTION.status"
        );
      }
      sentChangeFields.push("audit.questionnaireStatus", "audit.trackStatus", "audit.nextAuditOn");
      await audit.save();

      const workflowTenantId = await resolveAuditWorkflowTenantId({
        auditId: audit._id,
        fallbackTenantId: tenantId,
      });
      if (workflowTenantId) {
        await advanceMilestone({
          tenantId: workflowTenantId,
          auditId: audit._id,
          code: "QUESTIONNAIRE_PREP_IN_PROGRESS",
          desiredStatus: "COMPLETED",
        });
        await advanceMilestone({
          tenantId: workflowTenantId,
          auditId: audit._id,
          code: "QUESTIONNAIRE_RELEASED",
          desiredStatus: "COMPLETED",
        });
        await advanceMilestone({
          tenantId: workflowTenantId,
          auditId: audit._id,
          code: "SUPPLIER_RESPONSE_PENDING",
          desiredStatus: "IN_PROGRESS",
        });
        const assessmentType = await resolveAssessmentTypeForAudit({
          audit,
          tenantId: workflowTenantId,
        });
        if (assessmentType) {
          const tracker = await ensurePhaseTracker({
            audit,
            assessmentType,
            tenantId: workflowTenantId,
          });
          if (tracker) {
            const phases = tracker.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker.phases || {};
            let trackerUpdated = false;
            if (phases.PREP && phases.PREP.status !== "COMPLETED") {
              phases.PREP.status = "COMPLETED";
              phases.PREP.completedAt = phases.PREP.completedAt || now;
              phases.PREP.startedAt = phases.PREP.startedAt || now;
              phases.PREP.blockers = [];
              trackerUpdated = true;
            }
            if (phases.PLANNING && phases.PLANNING.status !== "COMPLETED") {
              phases.PLANNING.status = "COMPLETED";
              phases.PLANNING.completedAt = phases.PLANNING.completedAt || now;
              phases.PLANNING.startedAt = phases.PLANNING.startedAt || now;
              phases.PLANNING.blockers = [];
              trackerUpdated = true;
            }
            if (phases.EXECUTION && phases.EXECUTION.status !== "IN_PROGRESS") {
              phases.EXECUTION.status = "IN_PROGRESS";
              phases.EXECUTION.startedAt = phases.EXECUTION.startedAt || now;
              phases.EXECUTION.blockers = [];
              trackerUpdated = true;
            }
            if (tracker.currentPhaseKey !== "EXECUTION") {
              tracker.currentPhaseKey = "EXECUTION";
              trackerUpdated = true;
            }
            if (trackerUpdated) {
              tracker.phases = phases;
              await tracker.save();
            }
          }
        }
      }
    }

    if (artifact.artifactType === "INTIMATION_LETTER") {
      await applyIntimationSent({ audit, artifact, tenantId, actorId: req.user?._id });

      if (sendPaq && paqArtifactForCascade?.templateId) {
        paqArtifactForCascade.status = "sent";
        paqArtifactForCascade.updatedBy = req.user?._id;
        await paqArtifactForCascade.save();
        sentChangeFields.push("pre_audit_questionnaire.status");
        await writeAuditTrail({
          tenantId,
          auditId: audit._id,
          entityType: "artifact",
          entityId: paqArtifactForCascade._id,
          action: "ARTIFACT_SENT",
          actorId: req.user?._id,
          actorRole: req.user?.role,
          meta: {
            phaseKey: paqArtifactForCascade.phaseKey,
            artifactType: paqArtifactForCascade.artifactType,
            actorUsername,
            changeBrief: buildChangeBrief({
              collection: "audit-artifacts",
              fields: ["status"],
            }),
          },
        });
      }
    }

    const markedVisible =
      artifact.status === "sent" &&
      SUPPLIER_FACING_ARTIFACT_TYPES.has(String(artifact.artifactType || "").toUpperCase()) &&
      markAuditSupplierVisible({ audit, actorId: req.user?._id });
    if (markedVisible) {
      sentChangeFields.push("audit.supplierVisible", "audit.supplierVisibleAt", "audit.supplierVisibleBy");
      await audit.save();
    }

    if (["SCOPE", "AGENDA"].includes(artifact.artifactType)) {
      const trackingTenantId = tenantId || audit.tenantOrgId || null;
      if (trackingTenantId) {
        await advanceMilestone({
          tenantId: trackingTenantId,
          auditId: audit._id,
          code: MILESTONE_CODES.PAQ_SCOPE_SENT_TO_SUPPLIER,
          desiredStatus: "COMPLETED",
        });
      }
    }

    await NotificationOrchestratorService.emitEvent(
      "audit.artifact.sent",
      {
        entityType: "audit",
        entityId: audit._id,
        title: `Audit ID: ${resolveAuditLabel(audit)} - ${artifact.artifactType} sent`,
        message: `Artifact ${artifact.artifactType} is ready.`,
        recipientStrategy,
        severity: "info",
      },
      { tenantId: audit.tenantOrgId, role: "auditor" }
    );
    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "artifact",
      entityId: artifact._id,
      action: "ARTIFACT_SENT",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: {
        phaseKey: artifact.phaseKey,
        artifactType: artifact.artifactType,
        actorUsername,
        changeBrief: buildChangeBrief({
          collection: "audit-artifacts",
          fields: sentChangeFields,
        }),
      },
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "artifact",
        entityId: artifact._id,
        action: "ARTIFACT_SENT",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: { status: previousStatus, version: previousVersion },
        after: { status: artifact.status, version: artifact.version },
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
        meta: {
          phaseKey: artifact.phaseKey,
          artifactType: artifact.artifactType,
          actorUsername,
          changeBrief: buildChangeBrief({
            collection: "audit-artifacts",
            fields: sentChangeFields,
          }),
        },
      });
    }

    return res.json({ success: true, data: artifact, message: "Artifact sent successfully" });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to send artifact" });
  }
};

export const startPrepPhase = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    let phaseState = resolvePhaseState(audit);

    if (phaseState.currentPhase !== "PREP") {
      phaseState = applyPhaseTransition(phaseState, "PREP");
    } else if (phaseState.phases?.PREP?.status !== "IN_PROGRESS") {
      phaseState.phases.PREP.status = "IN_PROGRESS";
      phaseState.phases.PREP.startedAt = phaseState.phases.PREP.startedAt || new Date();
    }

    audit.phaseState = phaseState;
    await audit.save();
    await ensureArtifactsForPhase({ audit, phaseKey: "PREP", user: req.user, tenantId: req.tenantId });

    await NotificationOrchestratorService.emitEvent(
      "audit.phase.prep_started",
      {
        entityType: "audit",
        entityId: audit._id,
        title: "Pre-audit prep started",
        message: "Please complete the pre-audit questionnaire and upload requested documents.",
        recipientStrategy: "supplier_owner",
        severity: "info",
      },
      { tenantId: audit.tenantOrgId, role: "supplier" }
    );
    await writeAuditTrail({
      tenantId: audit.tenantOrgId || req.tenantId,
      auditId: audit._id,
      entityType: "phase",
      entityId: audit._id,
      action: "PREP_STARTED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: audit.tenantOrgId || req.tenantId,
        auditId: audit._id,
        entityType: "phase",
        entityId: audit._id,
        action: "PREP_STARTED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
      });
    }

    return res.json({ success: true, data: { phaseState } });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to start prep phase" });
  }
};

export const completePrepPhase = async (req, res) => {
  try {
    const { override = false } = req.body || {};
    const audit = await loadAudit(req);
    let phaseState = resolvePhaseState(audit);
    const readiness = await computePrepReadiness({ audit, tenantId: req.tenantId });
    const allowOverride = Boolean(override) && ADMIN_ROLES.has(req.user?.role);

    if (!allowOverride && readiness.missing.length) {
      return res.status(400).json({
        error: "PREP completion requirements not met",
        details: readiness,
      });
    }

    phaseState.phases.PREP.status = "COMPLETED";
    phaseState.phases.PREP.completedAt = new Date();
    phaseState.phases.PREP.meta = {
      ...(phaseState.phases.PREP.meta || {}),
      readinessScore: readiness.score,
      readinessChecks: readiness.checks,
    };

    if (phaseState.currentPhase === "PREP") {
      phaseState.currentPhase = "PLANNING";
      if (phaseState.phases?.PLANNING) {
        phaseState.phases.PLANNING.status = "IN_PROGRESS";
        phaseState.phases.PLANNING.startedAt = phaseState.phases.PLANNING.startedAt || new Date();
      }
    }

    audit.phaseState = phaseState;
    await audit.save();
    await ensureArtifactsForPhase({ audit, phaseKey: "PLANNING", user: req.user, tenantId: req.tenantId });

    await NotificationOrchestratorService.emitEvent(
      "audit.phase.prep_completed",
      {
        entityType: "audit",
        entityId: audit._id,
        title: "Pre-audit prep completed",
        message: "Supplier completed the pre-audit package.",
        recipientStrategy: "assigned_auditor",
        severity: "info",
      },
      { tenantId: audit.tenantOrgId, role: "auditor" }
    );
    await writeAuditTrail({
      tenantId: audit.tenantOrgId || req.tenantId,
      auditId: audit._id,
      entityType: "phase",
      entityId: audit._id,
      action: "PREP_COMPLETED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { readinessScore: readiness.score },
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: audit.tenantOrgId || req.tenantId,
        auditId: audit._id,
        entityType: "phase",
        entityId: audit._id,
        action: "PREP_COMPLETED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        ip: req.ip,
        userAgent: req.get?.("user-agent"),
        meta: { readinessScore: readiness.score },
      });
    }

    return res.json({ success: true, data: { phaseState, readiness } });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to complete prep phase" });
  }
};

export const getPhaseOptions = (req, res) => {
  return res.json({ success: true, data: { phases: AUDIT_PHASES } });
};
