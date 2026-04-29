import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { AuditPlan } from "../models/auditPlanModel.js";
import { AuditAgenda } from "../models/auditAgendaModel.js";
import { PreAuditQuestionnaire } from "../models/preAuditQuestionnaireModel.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { ENFORCE_AUDIT_PARTICIPANTS } from "../config/featureFlags.js";
import { assertAuditParticipant } from "../utils/auditAccess.js";
import { writeAuditTrail } from "../services/auditTrailService.js";
import { notifySupplier } from "../services/governance/notifySupplier.js";

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
  if (ENFORCE_AUDIT_PARTICIPANTS) {
    await assertAuditParticipant({ user: req.user, audit });
  }
  return audit;
};

const resolveArtifact = async ({ audit, tenantId, phaseKey, artifactType }) => {
  const direct = await AuditArtifact.findOne({
    tenantId,
    auditId: audit._id,
    phaseKey,
    artifactType,
  });
  if (direct) return direct;
  return AuditArtifact.findOne({
    tenantId,
    auditId: audit._id,
    artifactType,
  });
};

const ensureArtifactLink = async ({
  audit,
  tenantId,
  phaseKey,
  artifactType,
  linkedEntityType,
  linkedEntityId,
  status,
  templateId,
  user,
}) => {
  const existing = await resolveArtifact({ audit, tenantId, phaseKey, artifactType });
  if (existing) {
    existing.linkedEntityType = linkedEntityType;
    existing.linkedEntityId = linkedEntityId;
    if (status) existing.status = status;
    if (templateId && !existing.templateId) existing.templateId = templateId;
    existing.updatedBy = user?._id;
    await existing.save();
    return existing;
  }
  return AuditArtifact.create({
    tenantId,
    auditId: audit._id,
    phaseKey,
    artifactType,
    linkedEntityType,
    linkedEntityId,
    status: status || "draft",
    templateId: templateId || null,
    createdBy: user?._id,
    updatedBy: user?._id,
  });
};

const planStatusToArtifact = (status) => {
  if (status === "APPROVED") return "complete";
  if (status === "SUBMITTED") return "in_progress";
  return "draft";
};

const agendaStatusToArtifact = (status) => {
  if (status === "CONFIRMED") return "complete";
  if (status === "PROPOSED") return "in_progress";
  return "draft";
};

const paqStatusToArtifact = (status) => {
  if (status === "REVIEWED" || status === "SUBMITTED") return "complete";
  if (status === "SENT") return "sent";
  if (status === "IN_PROGRESS") return "in_progress";
  return "draft";
};

export const getAuditPlan = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const plan = await AuditPlan.findOne({ tenantId, auditId: audit._id }).lean();
    return res.json({ success: true, data: plan });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load audit plan" });
  }
};

export const upsertAuditPlan = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const payload = req.body || {};
    const plan = await AuditPlan.findOneAndUpdate(
      { tenantId, auditId: audit._id },
      {
        ...payload,
        tenantId,
        auditId: audit._id,
        updatedBy: req.user?._id,
        createdBy: payload.createdBy || req.user?._id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await ensureArtifactLink({
      audit,
      tenantId,
      phaseKey: payload.phaseKey || "PREP",
      artifactType: "SCOPE",
      linkedEntityType: "AuditPlan",
      linkedEntityId: plan._id,
      status: planStatusToArtifact(plan.status),
      user: req.user,
    });

    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "audit-plan",
      entityId: plan._id,
      action: "AUDIT_PLAN_UPSERTED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { status: plan.status },
    });

    // Notify supplier when plan reaches a sharable state.
    if (audit.supplier_id && plan.status && /APPROVED|FINALIZED|SHARED/i.test(plan.status)) {
      notifySupplier({
        tenantId,
        supplierUserId: audit.supplier_id,
        eventKey: "AUDIT_PLAN_SHARED",
        actionUrl: `/audits/${audit._id}/progress?focus=plan`,
        payload: { auditId: audit._id, planId: plan._id, status: plan.status },
      }).catch((e) => console.error("notifySupplier(AUDIT_PLAN_SHARED) failed:", e?.message));
    }

    return res.json({ success: true, data: plan });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to save audit plan" });
  }
};

export const getAgenda = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const agenda = await AuditAgenda.findOne({ tenantId, auditId: audit._id }).lean();
    return res.json({ success: true, data: agenda });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load agenda" });
  }
};

export const upsertAgenda = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const payload = req.body || {};
    const agenda = await AuditAgenda.findOneAndUpdate(
      { tenantId, auditId: audit._id },
      {
        ...payload,
        tenantId,
        auditId: audit._id,
        updatedBy: req.user?._id,
        createdBy: payload.createdBy || req.user?._id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await ensureArtifactLink({
      audit,
      tenantId,
      phaseKey: payload.phaseKey || "PLANNING",
      artifactType: "AGENDA",
      linkedEntityType: "AuditAgenda",
      linkedEntityId: agenda._id,
      status: agendaStatusToArtifact(agenda.status),
      user: req.user,
    });

    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "agenda",
      entityId: agenda._id,
      action: "AGENDA_UPSERTED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { status: agenda.status },
    });

    if (audit.supplier_id && agenda.status && /SHARED|APPROVED|PROPOSED/i.test(agenda.status)) {
      notifySupplier({
        tenantId,
        supplierUserId: audit.supplier_id,
        eventKey: "AUDIT_AGENDA_SHARED",
        actionUrl: `/audits/${audit._id}/progress?focus=agenda`,
        payload: { auditId: audit._id, agendaId: agenda._id, status: agenda.status },
      }).catch((e) => console.error("notifySupplier(AUDIT_AGENDA_SHARED) failed:", e?.message));
    }

    return res.json({ success: true, data: agenda });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to save agenda" });
  }
};

export const getPreAuditQuestionnaire = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const questionnaire = await PreAuditQuestionnaire.findOne({
      tenantId,
      auditId: audit._id,
    }).lean();
    return res.json({ success: true, data: questionnaire });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load pre-audit questionnaire" });
  }
};

export const upsertPreAuditQuestionnaire = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const payload = req.body || {};
    const questionnaire = await PreAuditQuestionnaire.findOneAndUpdate(
      { tenantId, auditId: audit._id },
      {
        ...payload,
        tenantId,
        auditId: audit._id,
        updatedBy: req.user?._id,
        createdBy: payload.createdBy || req.user?._id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await ensureArtifactLink({
      audit,
      tenantId,
      phaseKey: "PREP",
      artifactType: "PRE_AUDIT_QUESTIONNAIRE",
      linkedEntityType: "PreAuditQuestionnaire",
      linkedEntityId: questionnaire._id,
      status: paqStatusToArtifact(questionnaire.status),
      templateId: questionnaire.templateId,
      user: req.user,
    });

    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "pre-audit-questionnaire",
      entityId: questionnaire._id,
      action: "PRE_AUDIT_QUESTIONNAIRE_UPSERTED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { status: questionnaire.status },
    });

    if (audit.supplier_id && questionnaire.status && /SENT|ASSIGNED|RELEASED/i.test(questionnaire.status)) {
      notifySupplier({
        tenantId,
        supplierUserId: audit.supplier_id,
        eventKey: "PRE_AUDIT_QUESTIONNAIRE_SENT",
        actionUrl: `/audits/${audit._id}/questionnaire`,
        payload: {
          auditId: audit._id,
          questionnaireId: questionnaire._id,
          status: questionnaire.status,
          dueDate: questionnaire.dueDate,
        },
      }).catch((e) => console.error("notifySupplier(PRE_AUDIT_QUESTIONNAIRE_SENT) failed:", e?.message));
    }

    return res.json({ success: true, data: questionnaire });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to save pre-audit questionnaire" });
  }
};
