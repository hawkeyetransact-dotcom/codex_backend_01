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
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const normalizeType = (value) => String(value || "").toUpperCase();

const resolveAuditLabel = (audit) =>
  audit?.internalRequestId || audit?.hawkeyeRequestId || audit?.supplierRequestId || String(audit?._id || "");

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

const applyIntimationSent = async ({ audit, artifact }) => {
  audit.trackStatus = "Audit intimation sent";
  audit.nextAuditOn = "supplier";
  await audit.save();

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
  const created = [];
  for (const artifactType of types) {
    const exists = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(resolvedTenantId),
      auditId: audit._id,
      phaseKey,
      artifactType,
    }).lean();
    if (exists) continue;

    const templateId =
      artifactType === "EXECUTION_QUESTIONNAIRE" ? audit.selectedTemplateId || null : null;

    const record = await AuditArtifact.create({
      tenantId: resolvedTenantId,
      auditId: audit._id,
      phaseKey,
      artifactType,
      ownerRole: artifactOwners[artifactType] || null,
      templateId: templateId || null,
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
  const entries = Object.entries(PHASE_ARTIFACT_DEFAULTS);
  for (const [phaseKey, types] of entries) {
    if (types.includes(artifactType)) return phaseKey;
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

const canEditArtifact = (artifact, userRole) => {
  const normalized = normalizeRole(userRole);
  if (ADMIN_ROLES.has(normalized)) return true;
  if (artifact?.ownerRole && artifact.ownerRole === normalized) return true;
  if (artifact?.artifactType === "INTIMATION_LETTER" && normalized === "supplier") {
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
  if (normalized === "supplieruser" || normalized === "supplier_user" || normalized === "supplier-user") {
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
  if (ADMIN_ROLES.has(normalized)) return true;
  if (normalized === "auditor") return true;
  if (normalized === "buyer") return artifact?.ownerRole === "buyer";
  if (normalized === "supplier") {
    if (artifact?.artifactType === "INTIMATION_LETTER") return true;
    return artifact?.ownerRole === "supplier";
  }
  return false;
};

const resolveRecipientStrategy = (artifact) => {
  if (!artifact) return "assigned_auditor";
  if (artifact.ownerRole === "supplier") return "assigned_auditor";
  if (["EXECUTION_QUESTIONNAIRE", "PRE_AUDIT_QUESTIONNAIRE", "DRL", "INTIMATION_LETTER"].includes(artifact.artifactType)) {
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
        userAgent: req.get("user-agent"),
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
    if (dedupedArtifacts.length) {
      const updated = [];
      for (const artifact of dedupedArtifacts) {
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
      const hydrated = dedupedArtifacts.map((artifact) => ({
        ...artifact,
        templateQuestions: grouped.get(artifact.templateId) || [],
      }));
      return res.json({ success: true, data: hydrated });
    }

    return res.json({ success: true, data: dedupedArtifacts });
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
          existing.data = {};
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
              userAgent: req.get("user-agent"),
              meta: { phaseKey, artifactType },
            });
          }
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

    const nextData = data && typeof data === "object" ? { ...data } : {};

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
        nextData.selectedTemplateIds = paqTemplateIds;
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
        userAgent: req.get("user-agent"),
        meta: { phaseKey, artifactType },
      });
    }

    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to create artifact" });
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
    const phaseClosed = await isPhaseClosed({ audit, phaseKey: artifact.phaseKey, tenantId });
    if (phaseClosed && !(override && ADMIN_ROLES.has(req.user?.role))) {
      return res.status(400).json({ error: "Phase is closed" });
    }

    if (!canEditArtifact(artifact, req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const normalizedRole = normalizeRole(req.user?.role);
    const isBuyerRole = ["buyer", "admin", "superadmin", "tenant_admin"].includes(normalizedRole);
    const isSupplierRole = normalizedRole === "supplier";
    const isIntimation = artifact.artifactType === "INTIMATION_LETTER";

    const nextData = { ...(artifact.data || {}) };
    if (data && typeof data === "object") {
      Object.assign(nextData, data);
    }
    const allowResponseUpdate =
      !isIntimation ||
      (!isSupplierRole && !(isBuyerRole && artifact.status === "sent"));
    if (Array.isArray(responses) && allowResponseUpdate) {
      nextData.responses = responses;
    }
    artifact.data = nextData;

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

    const nextVersion = (artifact.version || 1) + 1;
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
    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "artifact",
      entityId: artifact._id,
      action: submit ? "ARTIFACT_SUBMITTED" : "ARTIFACT_UPDATED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { phaseKey: artifact.phaseKey, artifactType: artifact.artifactType, status: artifact.status },
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
        userAgent: req.get("user-agent"),
        meta: { phaseKey: artifact.phaseKey, artifactType: artifact.artifactType },
      });
    }

    if (submit && artifact.ownerRole === "supplier") {
      await NotificationOrchestratorService.emitEvent(
        "audit.artifact.submitted",
        {
          entityType: "audit",
          entityId: audit._id,
          title: `Audit ID: ${resolveAuditLabel(audit)} - ${artifact.artifactType} submitted`,
          message: `Artifact ${artifact.artifactType} was submitted.`,
          recipientStrategy: "assigned_auditor",
          severity: "info",
        },
        { tenantId: audit.tenantOrgId, role: "auditor" }
      );
    }

    if (submit && isIntimation && isSupplierRole) {
      const decisionRaw = nextData?.supplierDecision || "";
      const decision = String(decisionRaw || "").toUpperCase();
      const proposedDates = Array.isArray(nextData?.proposedDates)
        ? nextData.proposedDates.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()))
        : [];

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
        audit.supplierDecision = "ACCEPTED";
        audit.supplierRejectionReason = null;
        audit.trackStatus = "Supplier accepted intimation";
        audit.nextAuditOn = "buyer";
      }
      audit.supplierDecisionAt = new Date();
      audit.supplierDecisionBy = req.user?._id;
      if (proposedDates.length) {
        audit.supplierProposedDates = proposedDates;
      }
      artifact.data = {
        ...(artifact.data || {}),
        supplierDecision: audit.supplierDecision,
        proposedDates: proposedDates.length ? proposedDates.map((d) => d.toISOString()) : undefined,
      };
      await artifact.save();
      await audit.save();

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
        const finalDateRaw = nextData?.finalDate || nextData?.acceptedDate;
        const parsedFinal = finalDateRaw ? new Date(finalDateRaw) : null;
        const validFinal = parsedFinal && !Number.isNaN(parsedFinal.getTime()) ? parsedFinal : null;
        const previousEta = audit.auditETA || audit.complianceDate || null;
        if (validFinal) {
          audit.auditETA = validFinal;
          audit.complianceDate = validFinal;
        }
        audit.trackStatus = "Audit schedule confirmed";
        audit.nextAuditOn = "buyer";
        await audit.save();

        if (validFinal && previousEta) {
          const deltaMs = validFinal.getTime() - new Date(previousEta).getTime();
          if (deltaMs) {
            const workflowTenantId = await resolveAuditWorkflowTenantId({
              auditId: audit._id,
              fallbackTenantId: tenantId,
            });
            if (workflowTenantId) {
              await shiftMilestoneExpectedAt({
                auditId: audit._id,
                tenantId: workflowTenantId,
                deltaMs,
              });
            }
          }
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
        await applyIntimationSent({ audit, artifact });
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
    const phaseClosed = await isPhaseClosed({ audit, phaseKey: artifact.phaseKey, tenantId });
    if (phaseClosed && !(override && ADMIN_ROLES.has(req.user?.role))) {
      return res.status(400).json({ error: "Phase is closed" });
    }

    if (!canSendArtifact(artifact, req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Allow sending intimation letters even without a template so attachments-only flow works.

    if (
      ENABLE_PREP_PHASE &&
      !ALLOW_EARLY_ARTIFACT_SEND &&
      artifact.artifactType === "EXECUTION_QUESTIONNAIRE" &&
      !override
    ) {
      const phaseState = resolvePhaseState(audit);
      if (phaseState.phases?.PREP?.status !== "COMPLETED") {
        return res.status(400).json({ error: "PREP phase must be completed before sending execution questionnaire" });
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
      audit.questionnaireStatus = "sent_to_supplier";
      audit.trackStatus = "Request sent to Supplier";
      audit.nextAuditOn = "supplier";
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
      }
    }

    if (artifact.artifactType === "INTIMATION_LETTER") {
      await applyIntimationSent({ audit, artifact });

      if (sendPaq) {
        const paqArtifact = await AuditArtifact.findOne({
          ...buildArtifactTenantFilter(tenantId),
          auditId: audit._id,
          artifactType: "PRE_AUDIT_QUESTIONNAIRE",
        });
        if (paqArtifact && paqArtifact.templateId) {
          paqArtifact.status = "sent";
          paqArtifact.updatedBy = req.user?._id;
          await paqArtifact.save();
          await writeAuditTrail({
            tenantId,
            auditId: audit._id,
            entityType: "artifact",
            entityId: paqArtifact._id,
            action: "ARTIFACT_SENT",
            actorId: req.user?._id,
            actorRole: req.user?.role,
            meta: { phaseKey: paqArtifact.phaseKey, artifactType: paqArtifact.artifactType },
          });
        }
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
      meta: { phaseKey: artifact.phaseKey, artifactType: artifact.artifactType },
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
        before: { status: "draft" },
        after: { status: artifact.status, version: artifact.version },
        ip: req.ip,
        userAgent: req.get("user-agent"),
        meta: { phaseKey: artifact.phaseKey, artifactType: artifact.artifactType },
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
        userAgent: req.get("user-agent"),
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
        userAgent: req.get("user-agent"),
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
