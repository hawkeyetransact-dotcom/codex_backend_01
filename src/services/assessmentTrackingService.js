import { AssessmentType } from "../models/assessmentTypeModel.js";
import { PhaseTracker } from "../models/phaseTrackerModel.js";
import { StatusDefinition } from "../models/statusDefinitionModel.js";
import { StatusTracker } from "../models/statusTrackerModel.js";
import { WorkflowMilestoneDefinition } from "../models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
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

const MILESTONE_COMPLETE_STATUSES = new Set(["COMPLETED", "SKIPPED"]);
const MILESTONE_ACTIVE_STATUSES = new Set(["IN_PROGRESS", "COMPLETED", "SKIPPED"]);
const MILESTONE_PHASE_KEY_MAP = {
  AR_CREATED: "INITIATED",
  INTIMATION_LETTER_SENT: "INITIATED",
  SUPPLIER_INTIMATION_ACCEPTED: "INITIATED",
  AR_AUDITOR_ASSIGNED: "PREP",
  AR_AUDITOR_ACCEPTANCE_PENDING: "PREP",
  AR_ACCEPTED: "PREP",
  PAQ_SCOPE_SENT_TO_SUPPLIER: "PREP",
  SUPPLIER_SCOPE_AGENDA_SIGNED: "PREP",
  PAQ_RESPONDED: "PREP",
  TEMPLATE_SELECTION_PENDING: "PLANNING",
  QUESTIONNAIRE_PREP_IN_PROGRESS: "PLANNING",
  QUESTIONNAIRE_RELEASED: "PLANNING",
  SUPPLIER_RESPONSE_PENDING: "EXECUTION",
  SUPPLIER_SUBMITTED: "EXECUTION",
  AUDITOR_REVIEW_PENDING: "EXECUTION",
  FOLLOWUP_REQUESTED: "EXECUTION",
  FOLLOWUP_RESPONSES_SUBMITTED: "EXECUTION",
  FINAL_REVIEW_AND_SIGNOFF: "FINDINGS",
  REPORT_GENERATION_IN_PROGRESS: "CLOSURE",
  REPORT_PUBLISHED: "CLOSURE",
};
const BASE_PHASE_STATE = { status: "NOT_STARTED", startedAt: null, completedAt: null, blockers: [] };

const normalizeMilestoneCode = (value) => String(value || "").trim().toUpperCase();

const getOrderedPhaseDefs = (phases = []) =>
  [...(phases || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

const toPhaseStateMap = (tracker) => {
  const raw = tracker?.phases instanceof Map ? Object.fromEntries(tracker.phases) : tracker?.phases || {};
  const map = {};
  Object.entries(raw || {}).forEach(([phaseKey, phase]) => {
    map[phaseKey] = {
      status: phase?.status || "NOT_STARTED",
      startedAt: phase?.startedAt || null,
      completedAt: phase?.completedAt || null,
      blockers: Array.isArray(phase?.blockers) ? phase.blockers : [],
    };
  });
  return map;
};

const sameTimestamp = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : null;
  const rightTime = right ? new Date(right).getTime() : null;
  if (leftTime === null && rightTime === null) return true;
  return leftTime === rightTime;
};

const earliestDate = (dates = []) => {
  let best = null;
  dates.forEach((value) => {
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    if (!best || date < best) best = date;
  });
  return best;
};

const latestDate = (dates = []) => {
  let best = null;
  dates.forEach((value) => {
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    if (!best || date > best) best = date;
  });
  return best;
};

const inferPhaseByMilestoneOrder = (order, phaseKeys = []) => {
  const normalizedOrder = Number(order) || 0;
  if (normalizedOrder <= 30 && phaseKeys.includes("INITIATED")) return "INITIATED";
  if (normalizedOrder <= 90 && phaseKeys.includes("PREP")) return "PREP";
  if (normalizedOrder <= 120 && phaseKeys.includes("PLANNING")) return "PLANNING";
  if (normalizedOrder <= 170 && phaseKeys.includes("EXECUTION")) return "EXECUTION";
  if (normalizedOrder <= 190 && phaseKeys.includes("FINDINGS")) return "FINDINGS";
  if (normalizedOrder <= 210 && phaseKeys.includes("CLOSURE")) return "CLOSURE";
  if (phaseKeys.includes("SURVEILLANCE")) return "SURVEILLANCE";
  return phaseKeys[0] || null;
};

const inferPhaseKeyForMilestone = ({ code, definition, phaseKeys }) => {
  const mapped = MILESTONE_PHASE_KEY_MAP[code];
  if (mapped && phaseKeys.includes(mapped)) return mapped;

  const text = `${code} ${definition?.name || ""}`.toUpperCase();
  if (text.includes("SURVEILLANCE") && phaseKeys.includes("SURVEILLANCE")) return "SURVEILLANCE";
  if ((text.includes("CAPA") || text.includes("CORRECTIVE")) && phaseKeys.includes("CAPA")) return "CAPA";
  if (
    (text.includes("FINDING") || text.includes("OBSERVATION") || text.includes("SIGNOFF")) &&
    phaseKeys.includes("FINDINGS")
  ) {
    return "FINDINGS";
  }
  if ((text.includes("REPORT") || text.includes("CLOSURE")) && phaseKeys.includes("CLOSURE")) return "CLOSURE";
  if (
    (text.includes("QUESTIONNAIRE") || text.includes("FOLLOWUP") || text.includes("SUPPLIER_RESPONSE")) &&
    phaseKeys.includes("EXECUTION")
  ) {
    return "EXECUTION";
  }
  if ((text.includes("SCOPE") || text.includes("PAQ") || text.includes("AUDITOR")) && phaseKeys.includes("PREP")) {
    return "PREP";
  }
  if ((text.includes("INTIMATION") || text.includes("REQUEST")) && phaseKeys.includes("INITIATED")) {
    return "INITIATED";
  }
  return inferPhaseByMilestoneOrder(definition?.order, phaseKeys);
};

const upsertPhaseState = (phaseStates, phaseKey) => {
  if (!phaseStates[phaseKey]) {
    phaseStates[phaseKey] = { ...BASE_PHASE_STATE };
  }
  return phaseStates[phaseKey];
};

const phaseHasExistingProgress = (phaseState) =>
  phaseState &&
  (phaseState.status !== "NOT_STARTED" || Boolean(phaseState.startedAt) || Boolean(phaseState.completedAt));

const dedupeMilestoneDefinitions = (definitions = []) => {
  const byCode = new Map();
  definitions.forEach((definition) => {
    const code = normalizeMilestoneCode(definition?.code);
    if (!code || byCode.has(code)) return;
    byCode.set(code, {
      ...definition,
      code,
      name: definition?.name || code,
      order: Number(definition?.order) || 0,
    });
  });
  return Array.from(byCode.values()).sort((left, right) => (left.order || 0) - (right.order || 0));
};

export const syncPhaseTrackerFromMilestones = async ({ tracker, assessmentType, tenantId }) => {
  if (!tracker || !assessmentType || !tenantId) return tracker;
  const orderedPhases = getOrderedPhaseDefs(assessmentType.phases || []);
  if (!orderedPhases.length) return tracker;

  const phaseKeys = orderedPhases.map((phase) => phase.phaseKey).filter(Boolean);
  const currentPhaseStates = toPhaseStateMap(tracker);
  const nextPhaseStates = { ...currentPhaseStates };
  phaseKeys.forEach((phaseKey) => upsertPhaseState(nextPhaseStates, phaseKey));

  const [definitionsRaw, instancesRaw] = await Promise.all([
    WorkflowMilestoneDefinition.find({
      tenantId,
      workflowType: "AUDIT",
      isActive: true,
    })
      .sort({ order: 1, createdAt: 1 })
      .lean(),
    WorkflowMilestoneInstance.find({
      tenantId,
      workflowEntityType: "AuditRequest",
      workflowEntityId: tracker.workflowEntityId,
    }).lean(),
  ]);

  if (!definitionsRaw.length && !instancesRaw.length) return tracker;

  const definitions = dedupeMilestoneDefinitions(definitionsRaw);
  const definitionByCode = new Map(definitions.map((definition) => [definition.code, definition]));
  instancesRaw.forEach((instance, index) => {
    const code = normalizeMilestoneCode(instance?.milestoneCode);
    if (!code || definitionByCode.has(code)) return;
    definitionByCode.set(code, {
      code,
      name: code,
      order: 1000 + index,
    });
  });

  const orderedDefinitions = Array.from(definitionByCode.values()).sort(
    (left, right) => (left.order || 0) - (right.order || 0)
  );
  if (!orderedDefinitions.length) return tracker;

  const instancesByCode = new Map();
  instancesRaw.forEach((instance) => {
    const code = normalizeMilestoneCode(instance?.milestoneCode);
    if (!code || instancesByCode.has(code)) return;
    instancesByCode.set(code, instance);
  });

  const milestoneCodesByPhase = new Map(phaseKeys.map((phaseKey) => [phaseKey, []]));
  orderedDefinitions.forEach((definition) => {
    const code = normalizeMilestoneCode(definition.code);
    if (!code) return;
    const phaseKey = inferPhaseKeyForMilestone({
      code,
      definition,
      phaseKeys,
    });
    if (!phaseKey || !milestoneCodesByPhase.has(phaseKey)) return;
    const existing = milestoneCodesByPhase.get(phaseKey) || [];
    if (!existing.includes(code)) existing.push(code);
    milestoneCodesByPhase.set(phaseKey, existing);
  });

  let hasChanges = false;
  const phaseCandidates = new Set();

  phaseKeys.forEach((phaseKey) => {
    const codes = milestoneCodesByPhase.get(phaseKey) || [];
    const state = upsertPhaseState(nextPhaseStates, phaseKey);
    if (codes.length) phaseCandidates.add(phaseKey);
    if (phaseHasExistingProgress(state)) phaseCandidates.add(phaseKey);
    if (!codes.length) return;

    const hasMilestoneActivity = codes.some((code) => instancesByCode.has(code));
    if (!hasMilestoneActivity && !phaseHasExistingProgress(state)) return;

    const milestones = codes.map((code) => instancesByCode.get(code) || { status: "NOT_STARTED" });
    const allCompleted = milestones.every((milestone) =>
      MILESTONE_COMPLETE_STATUSES.has(String(milestone?.status || "NOT_STARTED").toUpperCase())
    );
    const anyStarted = milestones.some((milestone) =>
      MILESTONE_ACTIVE_STATUSES.has(String(milestone?.status || "NOT_STARTED").toUpperCase())
    );
    const nextStatus = allCompleted ? "COMPLETED" : anyStarted ? "IN_PROGRESS" : "NOT_STARTED";

    if (state.status !== nextStatus) {
      state.status = nextStatus;
      hasChanges = true;
    }

    const startedAt = earliestDate(
      milestones.flatMap((milestone) => [milestone?.startedAt, milestone?.completedAt, milestone?.updatedAt])
    );
    const completedAt = latestDate(milestones.map((milestone) => milestone?.completedAt));

    if (nextStatus === "COMPLETED") {
      const resolvedCompletedAt = completedAt || state.completedAt || new Date();
      if (!sameTimestamp(state.completedAt, resolvedCompletedAt)) {
        state.completedAt = resolvedCompletedAt;
        hasChanges = true;
      }
      const resolvedStartedAt = startedAt || state.startedAt || resolvedCompletedAt;
      if (!sameTimestamp(state.startedAt, resolvedStartedAt)) {
        state.startedAt = resolvedStartedAt;
        hasChanges = true;
      }
    } else if (nextStatus === "IN_PROGRESS") {
      const resolvedStartedAt = startedAt || state.startedAt || new Date();
      if (!sameTimestamp(state.startedAt, resolvedStartedAt)) {
        state.startedAt = resolvedStartedAt;
        hasChanges = true;
      }
      if (state.completedAt) {
        state.completedAt = null;
        hasChanges = true;
      }
    }
  });

  if (tracker.currentPhaseKey) phaseCandidates.add(tracker.currentPhaseKey);
  const orderedPhaseIndex = new Map(orderedPhases.map((phase, index) => [phase.phaseKey, index]));
  const existingPhaseIndex = orderedPhaseIndex.get(tracker.currentPhaseKey) ?? 0;
  const firstIncompleteCandidate = orderedPhases.find((phase) => {
    if (!phaseCandidates.has(phase.phaseKey)) return false;
    const status = nextPhaseStates[phase.phaseKey]?.status || "NOT_STARTED";
    return status !== "COMPLETED";
  });
  const firstIncompleteIndex =
    firstIncompleteCandidate && orderedPhaseIndex.has(firstIncompleteCandidate.phaseKey)
      ? orderedPhaseIndex.get(firstIncompleteCandidate.phaseKey)
      : -1;
  const lastCandidateIndex = orderedPhases.reduce((acc, phase, index) => {
    if (phaseCandidates.has(phase.phaseKey)) return index;
    return acc;
  }, -1);
  const targetPhaseIndex = Math.max(existingPhaseIndex, firstIncompleteIndex >= 0 ? firstIncompleteIndex : lastCandidateIndex);
  const targetPhase = orderedPhases[targetPhaseIndex] || orderedPhases[0];

  if (targetPhase?.phaseKey) {
    const targetState = upsertPhaseState(nextPhaseStates, targetPhase.phaseKey);
    if (targetState.status === "NOT_STARTED") {
      targetState.status = "IN_PROGRESS";
      if (!targetState.startedAt) targetState.startedAt = new Date();
      hasChanges = true;
    }
    if (tracker.currentPhaseKey !== targetPhase.phaseKey) {
      tracker.currentPhaseKey = targetPhase.phaseKey;
      hasChanges = true;
    }
  }

  if (!hasChanges) return tracker;
  tracker.phases = nextPhaseStates;
  await tracker.save();
  return tracker;
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
