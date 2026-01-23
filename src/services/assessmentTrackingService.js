import { AssessmentType } from "../models/assessmentTypeModel.js";
import { PhaseTracker } from "../models/phaseTrackerModel.js";
import { StatusDefinition } from "../models/statusDefinitionModel.js";
import { StatusTracker } from "../models/statusTrackerModel.js";
import { PHASE_KEYS, STATUS_VALUES } from "../constants/assessmentTracking.js";

const buildPhaseMap = (phases = []) => {
  const map = {};
  phases.forEach((phase) => {
    map[phase.phaseKey] = {
      status: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      blockers: [],
    };
  });
  return map;
};

export const resolveAssessmentTypeForAudit = async ({ audit, tenantId }) => {
  if (!audit) return null;
  if (audit.assessmentTypeId) {
    const existing = await AssessmentType.findById(audit.assessmentTypeId).lean();
    if (existing) return existing;
  }

  const assessmentType =
    (await AssessmentType.findOne({ tenantId }).sort({ createdAt: 1 }).lean()) ||
    (await AssessmentType.findOne({ tenantId: null }).sort({ createdAt: 1 }).lean());

  if (assessmentType) {
    audit.assessmentTypeId = assessmentType._id;
    audit.assessmentTypeKey = assessmentType.key;
    await audit.save();
  }
  return assessmentType;
};

export const ensurePhaseTracker = async ({ audit, assessmentType, tenantId }) => {
  if (!audit || !assessmentType) return null;
  const existing = await PhaseTracker.findOne({
    tenantId,
    workflowEntityId: audit._id,
    workflowEntityType: "AuditRequest",
  });
  if (existing) return existing;

  const phases = buildPhaseMap(assessmentType.phases || []);
  const ordered = [...(assessmentType.phases || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const firstPhaseKey = ordered[0]?.phaseKey || PHASE_KEYS[0];
  if (phases[firstPhaseKey]) {
    phases[firstPhaseKey].status = "IN_PROGRESS";
    phases[firstPhaseKey].startedAt = new Date();
  }

  return PhaseTracker.create({
    tenantId,
    assessmentTypeId: assessmentType._id,
    workflowEntityType: "AuditRequest",
    workflowEntityId: audit._id,
    currentPhaseKey: firstPhaseKey,
    phases,
  });
};

export const ensureStatusTrackersForPhase = async ({ audit, assessmentType, tenantId, phaseKey }) => {
  const defs = await StatusDefinition.find({
    tenantId,
    assessmentTypeId: assessmentType._id,
    phaseKey,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();

  if (!defs.length) return [];

  const existing = await StatusTracker.find({
    tenantId,
    workflowEntityId: audit._id,
    phaseKey,
  }).lean();
  const existingCodes = new Set(existing.map((s) => s.statusCode));
  const now = new Date();

  const toCreate = defs
    .filter((def) => !existingCodes.has(def.statusCode))
    .map((def) => {
      const expectedAt =
        def.defaultDurationHours && def.defaultDurationHours > 0
          ? new Date(now.getTime() + def.defaultDurationHours * 60 * 60 * 1000)
          : null;
      return {
        tenantId,
        assessmentTypeId: assessmentType._id,
        workflowEntityType: "AuditRequest",
        workflowEntityId: audit._id,
        phaseKey,
        statusCode: def.statusCode,
        status: "NOT_STARTED",
        expectedAt,
        responsibleRole: def.defaultResponsibleRole || null,
      };
    });

  if (!toCreate.length) return existing;
  const created = await StatusTracker.insertMany(toCreate);
  return [...existing, ...created];
};

export const updatePhaseTracker = async ({ tracker, toPhaseKey }) => {
  if (!tracker || !toPhaseKey) return tracker;
  const phases = tracker.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker.phases || {};
  const now = new Date();
  const current = tracker.currentPhaseKey;
  if (phases[current]) {
    phases[current].status = "COMPLETED";
    phases[current].completedAt = phases[current].completedAt || now;
    phases[current].startedAt = phases[current].startedAt || now;
  }
  if (phases[toPhaseKey]) {
    phases[toPhaseKey].status = "IN_PROGRESS";
    phases[toPhaseKey].startedAt = phases[toPhaseKey].startedAt || now;
    phases[toPhaseKey].blockers = [];
  }
  tracker.currentPhaseKey = toPhaseKey;
  tracker.phases = phases;
  await tracker.save();
  return tracker;
};

export const updatePhaseCompletionIfNeeded = async ({
  tracker,
  assessmentType,
  tenantId,
  phaseKey,
}) => {
  if (!tracker || !assessmentType) return tracker;
  const statuses = await StatusTracker.find({
    tenantId,
    workflowEntityId: tracker.workflowEntityId,
    phaseKey,
  }).lean();
  if (!statuses.length) return tracker;

  const allDone = statuses.every((s) => ["COMPLETED", "SKIPPED"].includes(s.status));
  if (!allDone) return tracker;

  const phases = tracker.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker.phases || {};
  const now = new Date();
  if (phases[phaseKey]) {
    phases[phaseKey].status = "COMPLETED";
    phases[phaseKey].completedAt = phases[phaseKey].completedAt || now;
  }

  const ordered = [...(assessmentType.phases || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const currentIdx = ordered.findIndex((p) => p.phaseKey === phaseKey);
  const next = ordered[currentIdx + 1];
  if (next && tracker.currentPhaseKey === phaseKey) {
    phases[next.phaseKey] = phases[next.phaseKey] || {
      status: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      blockers: [],
    };
    phases[next.phaseKey].status = "IN_PROGRESS";
    phases[next.phaseKey].startedAt = phases[next.phaseKey].startedAt || now;
    tracker.currentPhaseKey = next.phaseKey;
  }
  tracker.phases = phases;
  await tracker.save();
  return tracker;
};

export const sanitizeStatusUpdate = (status) => {
  if (!STATUS_VALUES.includes(status)) return null;
  return status;
};
