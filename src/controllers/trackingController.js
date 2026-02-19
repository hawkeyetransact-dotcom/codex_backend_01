import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { canUserAccessAudit } from "../utils/auditAccess.js";
import { StatusDefinition } from "../models/statusDefinitionModel.js";
import { StatusHistory } from "../models/statusHistoryModel.js";
import { StatusTracker } from "../models/statusTrackerModel.js";
import { PhaseTracker } from "../models/phaseTrackerModel.js";
import Tenant from "../models/tenantModel.js";
import { TEMPLATE_TYPES } from "../constants/assessmentTracking.js";
import { AUDIT_PHASES } from "../constants/auditPhases.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";
import {
  ensurePhaseTracker,
  ensureStatusTrackersForPhase,
  resolveAssessmentTypeForAudit,
  updatePhaseTracker,
  updatePhaseCompletionIfNeeded,
  sanitizeStatusUpdate,
} from "../services/assessmentTrackingService.js";

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

export const getAuditTracking = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = resolveTrackingTenantId({ audit, reqTenantId: req.tenantId });
    const assessmentType = await resolveAssessmentTypeForAudit({ audit, tenantId });
    if (!assessmentType) {
      const phases = AUDIT_PHASES.map((phase, index) => ({
        phaseKey: phase.key,
        name: phase.label,
        order: index + 1,
        status: "NOT_STARTED",
        startedAt: null,
        completedAt: null,
        blockers: [],
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
          currentPhaseKey: phases[0]?.phaseKey || "INITIATED",
          selectedPhaseKey: phases[0]?.phaseKey || "INITIATED",
          statuses: [],
          templateTypes: TEMPLATE_TYPES,
        },
      });
    }

    const tracker =
      (await PhaseTracker.findOne({
        tenantId,
        workflowEntityId: audit._id,
        workflowEntityType: "AuditRequest",
      })) ||
      (await ensurePhaseTracker({ audit, assessmentType, tenantId }));

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
