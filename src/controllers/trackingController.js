import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { canUserAccessAudit } from "../utils/auditAccess.js";
import { StatusDefinition } from "../models/statusDefinitionModel.js";
import { StatusHistory } from "../models/statusHistoryModel.js";
import { StatusTracker } from "../models/statusTrackerModel.js";
import { PhaseTracker } from "../models/phaseTrackerModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import Tenant from "../models/tenantModel.js";
import { TEMPLATE_TYPES } from "../constants/assessmentTracking.js";
import { AUDIT_PHASES } from "../constants/auditPhases.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import { derivePhaseStateFromLegacy, normalizePhaseState } from "../services/auditPhaseService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";
import {
  ensurePhaseTracker,
  ensureStatusTrackersForPhase,
  resolveAssessmentTypeForAudit,
  syncPhaseTrackerFromMilestones,
  updatePhaseTracker,
  updatePhaseCompletionIfNeeded,
  sanitizeStatusUpdate,
} from "../services/assessmentTrackingService.js";
import { syncAuditMilestonesFromStatus } from "../services/auditWorkflowSyncService.js";

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
  if (audit.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
    const allowed = await canUserAccessAudit({ user: req.user, audit });
    if (!allowed) {
      const err = new Error("Not Found");
      err.status = 404;
      throw err;
    }
  }
  return audit;
};

const loadTenantGranularity = async (tenantId, assessmentType) => {
  if (!tenantId) return assessmentType?.defaultGranularity || "STANDARD";
  const tenant = await Tenant.findById(tenantId).select("trackingGranularity").lean();
  return tenant?.trackingGranularity || assessmentType?.defaultGranularity || "STANDARD";
};

const resolveTrackingTenantId = ({ audit, reqTenantId }) => audit?.tenantOrgId || reqTenantId || null;
const SCOPE_AGENDA_SIGNED_CODE = "SUPPLIER_SCOPE_AGENDA_SIGNED";
const normalizeArtifactType = (value) => String(value || "").trim().toUpperCase();
const buildArtifactTenantFilter = (tenantId) => {
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    return {};
  }
  return { tenantId: { $in: [tenantId, null] } };
};

const normalizePhases = (tracker, assessmentType) => {
  const phaseMap = tracker?.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker?.phases || {};
  const phases = (assessmentType?.phases || []).map((phase) => ({
    phaseKey: phase.phaseKey,
    name: phase.name,
    order: phase.order,
    status: phaseMap?.[phase.phaseKey]?.status || "NOT_STARTED",
    startedAt: phaseMap?.[phase.phaseKey]?.startedAt || null,
    completedAt: phaseMap?.[phase.phaseKey]?.completedAt || null,
    blockers: phaseMap?.[phase.phaseKey]?.blockers || [],
  }));
  return phases.sort((a, b) => (a.order || 0) - (b.order || 0));
};

const resolveScopeAgendaRequiredMap = (audit) => {
  const map = new Map([
    ["SCOPE", true],
    ["AGENDA", true],
  ]);
  const checklist = Array.isArray(audit?.artifactChecklist) ? audit.artifactChecklist : [];
  checklist.forEach((item) => {
    const artifactType = normalizeArtifactType(item?.artifactType);
    if (!map.has(artifactType)) return;
    const required = Boolean(item?.required);
    map.set(artifactType, required);
    if (artifactType === "SCOPE") map.set("AGENDA", required);
    if (artifactType === "AGENDA") map.set("SCOPE", required);
  });
  return map;
};

const isValidDateValue = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const hasRoleSignature = (signatures, roleKey) => {
  const name = String(signatures?.[`${roleKey}Name`] || "").trim();
  if (!name) return false;
  return isValidDateValue(signatures?.[`${roleKey}SignedAt`]);
};

const resolveScopeAgendaSupplierSignoff = async ({ audit, tenantId }) => {
  const requiredMap = resolveScopeAgendaRequiredMap(audit);
  const [scopeArtifact, agendaArtifact] = await Promise.all([
    AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      artifactType: "SCOPE",
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean(),
    AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
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
      checks[artifactType] = {
        required: false,
        supplierSigned: true,
        confirmed: true,
        status: artifact?.status || null,
      };
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

const resolvePhaseState = (audit) =>
  audit?.phaseState ? normalizePhaseState(audit.phaseState) : derivePhaseStateFromLegacy(audit);

const reconcileScopeAgendaSignoff = async ({ audit, tenantId }) => {
  if (!audit?._id || !tenantId) return;

  const scopeAgendaSignoff = await resolveScopeAgendaSupplierSignoff({ audit, tenantId });
  if (!scopeAgendaSignoff.ready) return;

  const now = new Date();
  const phaseState = resolvePhaseState(audit);
  let shouldSaveAudit = false;

  const prepState = phaseState?.phases?.PREP;
  if (prepState && prepState.status !== "COMPLETED") {
    prepState.status = "COMPLETED";
    prepState.completedAt = prepState.completedAt || now;
    prepState.startedAt = prepState.startedAt || now;
    prepState.blockers = [];
    shouldSaveAudit = true;
    audit.trackStatus = "Preparation completed";
    audit.nextAuditOn = "auditor";
  }

  const planningState = phaseState?.phases?.PLANNING;
  if (planningState && planningState.status === "NOT_STARTED") {
    planningState.status = "IN_PROGRESS";
    planningState.startedAt = planningState.startedAt || now;
    planningState.blockers = [];
    shouldSaveAudit = true;
  }

  if (["INITIATED", "PREP", "", null, undefined].includes(phaseState?.currentPhase)) {
    phaseState.currentPhase = "PLANNING";
    shouldSaveAudit = true;
  }

  if (shouldSaveAudit) {
    audit.phaseState = phaseState;
    await audit.save();
  }

  const milestoneFilter = {
    tenantId,
    workflowEntityType: "AuditRequest",
    workflowEntityId: audit._id,
    milestoneCode: SCOPE_AGENDA_SIGNED_CODE,
  };
  const milestone = await WorkflowMilestoneInstance.findOne(milestoneFilter).lean();
  if (String(milestone?.status || "").toUpperCase() === "COMPLETED") return;

  if (!milestone) {
    try {
      await WorkflowMilestoneInstance.create({
        ...milestoneFilter,
        workflowType: "AUDIT",
        status: "NOT_STARTED",
      });
    } catch (error) {
      // Ignore duplicate inserts from concurrent requests.
    }
  }

  await WorkflowMilestoneService.markMilestoneCompleted(audit._id, SCOPE_AGENDA_SIGNED_CODE, {
    tenantId,
    role: "system",
  });
};

export const getAuditTracking = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    await syncAuditMilestonesFromStatus({
      audit,
      trackStatus: audit.trackStatus,
      questionnaireStatus: audit.questionnaireStatus,
      nextAuditOn: audit.nextAuditOn,
    });
    const tenantId = resolveTrackingTenantId({ audit, reqTenantId: req.tenantId });
    const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId });
    if (!assessmentType) {
      const resolvedState = resolvePhaseState(audit);
      const phases = AUDIT_PHASES.map((phase, index) => ({
        phaseKey: phase.key,
        name: phase.label,
        order: index + 1,
        status: resolvedState?.phases?.[phase.key]?.status || "NOT_STARTED",
        startedAt: resolvedState?.phases?.[phase.key]?.startedAt || null,
        completedAt: resolvedState?.phases?.[phase.key]?.completedAt || null,
        blockers: resolvedState?.phases?.[phase.key]?.blockers || [],
      }));
      return res.json({
        success: true,
        data: {
          assessmentType: {
            key: audit.assessmentTypeKey || "PHARMA_API_CGMP_ICHQ7",
            name: "cGMP (ICH Q7)",
          },
          granularity: "STANDARD",
          phases,
          currentPhaseKey: resolvedState?.currentPhase || phases[0]?.phaseKey || "INITIATED",
          selectedPhaseKey: resolvedState?.currentPhase || phases[0]?.phaseKey || "INITIATED",
          statuses: [],
          templateTypes: TEMPLATE_TYPES,
        },
      });
    }

    await reconcileScopeAgendaSignoff({ audit, tenantId });

    const tracker =
      (await PhaseTracker.findOne({
        tenantId,
        workflowEntityId: audit._id,
        workflowEntityType: "AuditRequest",
      })) ||
      (await ensurePhaseTracker({ audit, assessmentType, tenantId }));

    await syncPhaseTrackerFromMilestones({
      tracker,
      assessmentType,
      tenantId,
    });

    const granularity = await loadTenantGranularity(tenantId, assessmentType);
    const phases = normalizePhases(tracker, assessmentType);
    const currentPhaseKey = tracker.currentPhaseKey || phases[0]?.phaseKey;
    const requestedPhaseKey = req.query?.phaseKey;
    const phaseKey =
      requestedPhaseKey && phases.find((phase) => phase.phaseKey === requestedPhaseKey)
        ? requestedPhaseKey
        : currentPhaseKey;

    let statuses = [];
    if (granularity !== "BASIC") {
      await ensureStatusTrackersForPhase({
        audit,
        assessmentType,
        tenantId,
        phaseKey,
      });
      const includeCustom = granularity === "ADVANCED";
      const defs = await StatusDefinition.find({
        tenantId,
        assessmentTypeId: assessmentType._id,
        phaseKey,
        ...(includeCustom ? {} : { isDefault: true }),
        isActive: true,
      })
        .sort({ order: 1 })
        .lean();
      const trackers = await StatusTracker.find({
        tenantId,
        workflowEntityId: audit._id,
        phaseKey,
      }).lean();
      const trackerMap = new Map(trackers.map((t) => [t.statusCode, t]));
      statuses = defs.map((def) => {
        const entry = trackerMap.get(def.statusCode);
        return {
          statusCode: def.statusCode,
          name: def.name,
          order: def.order,
          phaseKey: def.phaseKey,
          status: entry?.status || "NOT_STARTED",
          expectedAt: entry?.expectedAt || null,
          completedAt: entry?.completedAt || null,
          responsibleRole: entry?.responsibleRole || def.defaultResponsibleRole,
          responsibleUserId: entry?.responsibleUserId || null,
          isDefault: def.isDefault,
        };
      });
    }

    return res.json({
      success: true,
      data: {
        assessmentType,
        granularity,
        phases,
        currentPhaseKey,
        selectedPhaseKey: phaseKey,
        statuses,
        templateTypes: TEMPLATE_TYPES,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load tracking" });
  }
};

export const transitionPhase = async (req, res) => {
  try {
    const { toPhaseKey } = req.body || {};
    if (!toPhaseKey) return res.status(400).json({ error: "toPhaseKey is required" });
    const audit = await loadAudit(req);
    const tenantId = resolveTrackingTenantId({ audit, reqTenantId: req.tenantId });
    const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId });
    if (!assessmentType) {
      return res.status(400).json({ error: "Assessment type not configured" });
    }

    const phaseTracker =
      (await PhaseTracker.findOne({
        tenantId,
        workflowEntityId: audit._id,
        workflowEntityType: "AuditRequest",
      })) ||
      (await ensurePhaseTracker({ audit, assessmentType, tenantId }));

    const allowed = new Set((assessmentType.phases || []).map((p) => p.phaseKey));
    if (!allowed.has(toPhaseKey)) {
      return res.status(400).json({ error: "Invalid phase key" });
    }

    const fromPhaseKey = phaseTracker.currentPhaseKey;
    await updatePhaseTracker({ tracker: phaseTracker, toPhaseKey });
    const statuses = await ensureStatusTrackersForPhase({
      audit,
      assessmentType,
      tenantId,
      phaseKey: toPhaseKey,
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "phase",
        entityId: audit._id,
        action: "PHASE_TRANSITION",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: { currentPhaseKey: fromPhaseKey },
        after: { currentPhaseKey: phaseTracker.currentPhaseKey },
        ip: req.ip,
        userAgent: req.get("user-agent"),
        meta: { toPhaseKey },
      });
    }

    return res.json({
      success: true,
      data: {
        currentPhaseKey: phaseTracker.currentPhaseKey,
        phases: normalizePhases(phaseTracker, assessmentType),
        statuses,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to transition phase" });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { statusCode, toStatus, reason = "", phaseKey } = req.body || {};
    if (!statusCode || !toStatus || !phaseKey) {
      return res.status(400).json({ error: "statusCode, phaseKey, and toStatus are required" });
    }
    const normalizedStatus = sanitizeStatusUpdate(toStatus);
    if (!normalizedStatus) return res.status(400).json({ error: "Invalid status value" });

    const audit = await loadAudit(req);
    const tenantId = resolveTrackingTenantId({ audit, reqTenantId: req.tenantId });
    const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId });
    if (!assessmentType) {
      return res.status(400).json({ error: "Assessment type not configured" });
    }

    const tracker = await PhaseTracker.findOne({
      tenantId,
      workflowEntityId: audit._id,
      workflowEntityType: "AuditRequest",
    });
    if (!tracker) {
      return res.status(400).json({ error: "Phase tracker not initialized" });
    }

    const entry = await StatusTracker.findOne({
      tenantId,
      workflowEntityId: audit._id,
      phaseKey,
      statusCode,
    });
    if (!entry) {
      return res.status(404).json({ error: "Status tracker not found" });
    }

    const fromStatus = entry.status;
    entry.status = normalizedStatus;
    if (normalizedStatus === "COMPLETED") {
      entry.completedAt = entry.completedAt || new Date();
    }
    await entry.save();

    await StatusHistory.create({
      tenantId,
      workflowEntityType: "AuditRequest",
      workflowEntityId: audit._id,
      phaseKey,
      statusCode,
      fromStatus,
      toStatus: normalizedStatus,
      changedByUserId: req.user?._id,
      changedByRole: req.user?.role,
      reason,
    });
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId,
        auditId: audit._id,
        entityType: "status",
        entityId: entry._id,
        action: "STATUS_UPDATED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: { status: fromStatus },
        after: { status: normalizedStatus },
        ip: req.ip,
        userAgent: req.get("user-agent"),
        meta: { phaseKey, statusCode, reason },
      });
    }

    const granularity = await loadTenantGranularity(tenantId, assessmentType);
    if (granularity !== "BASIC") {
      await updatePhaseCompletionIfNeeded({
        tracker,
        assessmentType,
        tenantId,
        phaseKey,
      });
    }

    return res.json({ success: true, data: entry });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to update status" });
  }
};
