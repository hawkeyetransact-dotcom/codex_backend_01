import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { Template } from "../models/templateModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
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
import { ENABLE_PREP_PHASE } from "../config/featureFlags.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);

const artifactOwners = {
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
  assertSameTenant(audit.tenantOrgId, req.tenantId);
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
      tenantId: resolvedTenantId,
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
      templateId,
      createdBy: user?._id,
      updatedBy: user?._id,
    });
    created.push(record);
  }
  return created;
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
  const scope = byType.get("SCOPE");

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
  if (ADMIN_ROLES.has(userRole)) return true;
  if (artifact?.ownerRole && artifact.ownerRole === userRole) return true;
  if (Array.isArray(artifact?.permissions) && artifact.permissions.includes(userRole)) return true;
  return false;
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
    const { phaseKey, artifactType, status, includeTemplateQuestions } = req.query || {};
    const filter = {
      tenantId,
      auditId: audit._id,
    };
    if (phaseKey) filter.phaseKey = phaseKey;
    if (artifactType) filter.artifactType = artifactType;
    if (status) filter.status = status;

    const artifacts = await AuditArtifact.find(filter).sort({ updatedAt: -1 }).lean();

    if (includeTemplateQuestions === "true") {
      const templateIds = artifacts.map((a) => a.templateId).filter(Boolean);
      const questions = await TemplateQuestions.find({ templateId: { $in: templateIds } })
        .sort({ order: 1 })
        .lean();
      const grouped = new Map();
      questions.forEach((q) => {
        const list = grouped.get(q.templateId) || [];
        list.push(q);
        grouped.set(q.templateId, list);
      });
      const hydrated = artifacts.map((artifact) => ({
        ...artifact,
        templateQuestions: grouped.get(artifact.templateId) || [],
      }));
      return res.json({ success: true, data: hydrated });
    }

    return res.json({ success: true, data: artifacts });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load artifacts" });
  }
};

export const getAuditArtifact = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const artifact = await AuditArtifact.findOne({
      tenantId,
      auditId: audit._id,
      _id: req.params.artifactId,
    }).lean();
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    return res.json({ success: true, data: artifact });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load artifact" });
  }
};

export const createAuditArtifact = async (req, res) => {
  try {
    const { phaseKey, artifactType, templateId, ownerRole, permissions } = req.body || {};
    if (!phaseKey || !AUDIT_PHASE_KEYS.includes(phaseKey)) {
      return res.status(400).json({ error: "Invalid phaseKey" });
    }
    if (!artifactType || !AUDIT_ARTIFACT_TYPES.includes(artifactType)) {
      return res.status(400).json({ error: "Invalid artifactType" });
    }
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;

    const existing = await AuditArtifact.findOne({
      tenantId,
      auditId: audit._id,
      phaseKey,
      artifactType,
    });
    if (existing) {
      return res.json({ success: true, data: existing });
    }

    if (templateId) {
      const template = await Template.findOne({ templateId: Number(templateId) }).lean();
      if (!template) {
        return res.status(400).json({ error: "Template not found" });
      }
    }

    const record = await AuditArtifact.create({
      tenantId,
      auditId: audit._id,
      phaseKey,
      artifactType,
      templateId: templateId ? Number(templateId) : null,
      ownerRole: ownerRole || artifactOwners[artifactType] || null,
      permissions: Array.isArray(permissions) ? permissions : [],
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to create artifact" });
  }
};

export const submitAuditArtifact = async (req, res) => {
  try {
    const { responses, data, submit, status } = req.body || {};
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const artifact = await AuditArtifact.findOne({
      tenantId,
      auditId: audit._id,
      _id: req.params.artifactId,
    });
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    if (!canEditArtifact(artifact, req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const nextData = { ...(artifact.data || {}) };
    if (data && typeof data === "object") {
      Object.assign(nextData, data);
    }
    if (Array.isArray(responses)) {
      nextData.responses = responses;
    }
    artifact.data = nextData;

    if (submit) {
      artifact.status = "complete";
    } else if (status) {
      artifact.status = status;
    } else if (artifact.status === "draft") {
      artifact.status = "in_progress";
    }

    artifact.updatedBy = req.user?._id;
    await artifact.save();

    return res.json({ success: true, data: artifact });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to submit artifact" });
  }
};

export const sendAuditArtifact = async (req, res) => {
  try {
    const { override = false } = req.body || {};
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const artifact = await AuditArtifact.findOne({
      tenantId,
      auditId: audit._id,
      _id: req.params.artifactId,
    });
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    if (!ADMIN_ROLES.has(req.user?.role) && req.user?.role !== "auditor") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (
      ENABLE_PREP_PHASE &&
      artifact.artifactType === "EXECUTION_QUESTIONNAIRE" &&
      !override
    ) {
      const phaseState = resolvePhaseState(audit);
      if (phaseState.phases?.PREP?.status !== "COMPLETED") {
        return res.status(400).json({ error: "PREP phase must be completed before sending execution questionnaire" });
      }
    }

    artifact.status = "sent";
    artifact.updatedBy = req.user?._id;
    await artifact.save();

    const recipientStrategy =
      artifact.artifactType === "EXECUTION_QUESTIONNAIRE" ||
      artifact.artifactType === "PRE_AUDIT_QUESTIONNAIRE" ||
      artifact.artifactType === "DRL"
        ? "supplier_owner"
        : "assigned_auditor";

    await NotificationOrchestratorService.emitEvent(
      "audit.artifact.sent",
      {
        entityType: "audit",
        entityId: audit._id,
        title: `${artifact.artifactType} sent`,
        message: `Artifact ${artifact.artifactType} is ready.`,
        recipientStrategy,
        severity: "info",
      },
      { tenantId: audit.tenantOrgId, role: "auditor" }
    );

    return res.json({ success: true, data: artifact });
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

    return res.json({ success: true, data: { phaseState, readiness } });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to complete prep phase" });
  }
};

export const getPhaseOptions = (req, res) => {
  return res.json({ success: true, data: { phases: AUDIT_PHASES } });
};
