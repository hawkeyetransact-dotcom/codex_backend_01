import mongoose from "mongoose";
import { Assessment } from "../../models/assessmentModel.js";
import { AuditCycleTemplate } from "../../models/auditCycleTemplateModel.js";
import { QuestionnaireArtifact } from "../../models/questionnaireArtifactModel.js";
import { buildAssessmentPhases } from "../../modules/auditEngine/assessmentBuilder.js";
import { AUDIT_PHASE_KEYS } from "../../modules/auditEngine/constants.js";
import { canAdvancePhase } from "../../modules/auditEngine/phaseRules.js";
import { ensureTenantModuleConfig, normalizeModules, assertModulesEnabled, sanitizeModules } from "../../services/moduleConfigService.js";
import { canAccessAssessment, resolveSupplierOwnerId } from "../../utils/assessmentAccess.js";
import { writeAdminAuditLog } from "../../middlewares/tenantMiddleware.js";

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const buildParticipants = (scope, user) => {
  const items = [];
  if (scope?.supplierId) items.push({ userId: scope.supplierId, role: "supplier" });
  if (scope?.buyerId) items.push({ userId: scope.buyerId, role: "buyer" });
  if (user?._id) items.push({ userId: user._id, role: user.role });
  return items.filter(Boolean);
};

const computePhaseStatus = (assessment) => {
  const phases = assessment.phases || [];
  phases.forEach((phase) => {
    const milestones = phase.milestones || [];
    if (!milestones.length) return;
    const allDone = milestones.every((m) => m.status === "DONE");
    const anyStarted = milestones.some((m) => ["IN_PROGRESS", "DONE"].includes(m.status));
    if (allDone) {
      phase.status = "DONE";
      phase.endDate = phase.endDate || new Date();
    } else if (anyStarted) {
      phase.status = "IN_PROGRESS";
      phase.startDate = phase.startDate || new Date();
    }
  });
  return phases;
};

export const createAssessment = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const config = await ensureTenantModuleConfig(tenantId);
    const modules = normalizeModules(sanitizeModules(req.body?.modules), config);
    const moduleCheck = assertModulesEnabled(config, modules);
    if (!moduleCheck.ok) {
      return res.status(400).json({ error: `Modules not enabled: ${moduleCheck.missing.join(", ")}` });
    }

    const scope = {
      siteId: toObjectId(req.body?.scope?.siteId),
      productId: toObjectId(req.body?.scope?.productId),
      supplierId: toObjectId(req.body?.scope?.supplierId),
      buyerId: toObjectId(req.body?.scope?.buyerId),
      description: req.body?.scope?.description || "",
    };

    const templates = await AuditCycleTemplate.find({ tenantId, module: { $in: modules } }).lean();
    const phases = buildAssessmentPhases({ modules, templates, baseDate: new Date() });
    if (phases[0]) {
      phases[0].status = "IN_PROGRESS";
      phases[0].startDate = new Date();
    }

    const assignedAuditors = (req.body?.assignedAuditors || []).map((a) => ({
      userId: toObjectId(a.userId),
      role: a.role || "LEAD",
      assignedAt: new Date(),
      assignedBy: req.user?._id,
    })).filter((a) => a.userId);

    const assessment = await Assessment.create({
      tenantId,
      modules,
      type: req.body?.type || "External",
      scope,
      currentPhaseKey: phases[0]?.key || AUDIT_PHASE_KEYS.PREP,
      phases,
      status: "ACTIVE",
      assignedAuditors,
      participants: buildParticipants(scope, req.user),
      createdBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: assessment });
  } catch (error) {
    console.error("createAssessment error", error);
    return res.status(500).json({ error: "Failed to create assessment" });
  }
};

const buildRoleFilter = (req) => {
  const role = req.user?.role;
  if (["admin", "superadmin", "tenant_admin"].includes(role)) return {};

  if (role === "auditor") {
    return { "assignedAuditors.userId": req.user._id };
  }

  if (role === "buyer") {
    return { "scope.buyerId": req.user._id };
  }

  if (role === "supplier") {
    return { "scope.supplierId": req.user._id };
  }

  if (role === "supplierUser") {
    const ownerId = resolveSupplierOwnerId(req.user);
    return ownerId ? { "scope.supplierId": ownerId } : { _id: null };
  }

  return { _id: null };
};

export const listAssessments = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const config = await ensureTenantModuleConfig(tenantId);
    const modules = normalizeModules(sanitizeModules(req.query?.module), config);
    const moduleCheck = assertModulesEnabled(config, modules);
    if (!moduleCheck.ok) {
      return res.status(403).json({ error: `Module access denied: ${moduleCheck.missing.join(", ")}` });
    }

    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const skip = Math.max(Number(req.query?.skip) || 0, 0);

    const filter = {
      tenantId,
      ...buildRoleFilter(req),
    };
    if (modules?.length) filter.modules = { $in: modules };
    if (req.query?.phase) filter.currentPhaseKey = req.query.phase;
    if (req.query?.status) filter.status = req.query.status;

    const [items, count] = await Promise.all([
      Assessment.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Assessment.countDocuments(filter),
    ]);

    return res.json({ success: true, data: items, meta: { count, limit, skip } });
  } catch (error) {
    console.error("listAssessments error", error);
    return res.status(500).json({ error: "Failed to list assessments" });
  }
};

export const getAssessment = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const assessment = await Assessment.findOne({ _id: req.params.id, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });
    return res.json({ success: true, data: assessment });
  } catch (error) {
    console.error("getAssessment error", error);
    return res.status(500).json({ error: "Failed to load assessment" });
  }
};

export const updatePhase = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { phaseKey, status, force } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    if (!phaseKey || !status) return res.status(400).json({ error: "phaseKey and status are required" });

    const assessment = await Assessment.findOne({ _id: req.params.id, tenantId });
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const paq = await QuestionnaireArtifact.findOne({
      tenantId,
      assessmentId: assessment._id,
      kind: "PRE_AUDIT",
    }).lean();

    const gate = canAdvancePhase({
      assessment,
      targetPhaseKey: phaseKey,
      paqStatus: paq?.status,
      force: Boolean(force),
    });
    if (!gate.ok) {
      return res.status(400).json({ error: gate.reason });
    }

    const phase = (assessment.phases || []).find((p) => p.key === phaseKey);
    if (!phase) return res.status(404).json({ error: "Phase not found" });

    const before = phase.toObject ? phase.toObject() : { ...phase };
    phase.status = status;
    if (status === "IN_PROGRESS" && !phase.startDate) phase.startDate = new Date();
    if (status === "DONE") phase.endDate = new Date();

    if (status === "IN_PROGRESS") assessment.currentPhaseKey = phaseKey;
    if (status === "DONE") {
      const phaseKeys = assessment.phases.map((p) => p.key);
      const idx = phaseKeys.indexOf(phaseKey);
      if (idx >= 0 && idx < phaseKeys.length - 1) {
        assessment.currentPhaseKey = phaseKeys[idx + 1];
      }
      if (idx === phaseKeys.length - 1) {
        assessment.status = "COMPLETED";
      }
    }

    assessment.phases = computePhaseStatus(assessment);
    await assessment.save();

    await writeAdminAuditLog({
      req,
      action: "assessment_phase_updated",
      entityType: "assessment",
      entityId: assessment._id,
      before,
      after: phase,
      tenantId,
    });

    return res.json({ success: true, data: assessment });
  } catch (error) {
    console.error("updatePhase error", error);
    return res.status(500).json({ error: "Failed to update phase" });
  }
};

export const updateMilestone = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const assessment = await Assessment.findOne({ _id: req.params.id, tenantId });
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const { status, ownerUserId, dueDate, notes } = req.body || {};
    const milestoneId = req.params.mid;

    let target = null;
    assessment.phases.forEach((phase) => {
      const match = (phase.milestones || []).find(
        (m) => String(m._id) === milestoneId || m.key === milestoneId
      );
      if (match) target = match;
    });

    if (!target) return res.status(404).json({ error: "Milestone not found" });
    const before = target.toObject ? target.toObject() : { ...target };

    if (status) target.status = status;
    if (ownerUserId) target.ownerUserId = toObjectId(ownerUserId);
    if (dueDate) target.dueDate = new Date(dueDate);
    if (notes !== undefined) target.notes = notes;
    if (status === "DONE") target.completedAt = new Date();

    assessment.phases = computePhaseStatus(assessment);
    await assessment.save();

    await writeAdminAuditLog({
      req,
      action: "assessment_milestone_updated",
      entityType: "assessment",
      entityId: assessment._id,
      before,
      after: target,
      tenantId,
    });

    return res.json({ success: true, data: assessment });
  } catch (error) {
    console.error("updateMilestone error", error);
    return res.status(500).json({ error: "Failed to update milestone" });
  }
};
