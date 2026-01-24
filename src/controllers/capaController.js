import { Capa } from "../models/capaModel.js";
import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";

const resolveCapaRecipients = async (capa) => {
  const recipients = new Set();
  if (capa?.ownerId) recipients.add(String(capa.ownerId));
  if (!recipients.size && capa?.auditId) {
    const assignments = await QuestionnaireSectionAssignment.find({
      auditRequestId: capa.auditId,
      status: { $ne: "REASSIGNED" },
    })
      .select("assignedToUserId")
      .lean();
    assignments.forEach((a) => {
      if (a?.assignedToUserId) recipients.add(String(a.assignedToUserId));
    });
  }
  if (!recipients.size && capa?.supplierId) recipients.add(String(capa.supplierId));
  return Array.from(recipients);
};

const notifyCapa = async ({ tenantId, capa, recipientUserIds, severity = "warning" }) => {
  if (!tenantId || !recipientUserIds.length) return;
  const title = `CAPA action needed: ${capa.title}`;
  const message = `A CAPA requires attention. Status: ${capa.status}.`;
  try {
    await NotificationOrchestratorService.emitEvent(
      "capa.assigned",
      {
        entityType: "capa",
        entityId: capa._id,
        title,
        message,
        action: { url: `/capas/${capa._id}`, label: "View CAPA" },
        recipientStrategy: "explicit",
        recipientUserIds,
        severity,
      },
      { tenantId, role: "supplier" }
    );
  } catch (err) {
    console.error("notifyCapa failed", err.message);
  }
};

const buildCapaFilter = (req) => {
  const { status, severity, supplierId, auditId, issueId } = req.query;
  const filter = {};
  if (req.tenantId) filter.tenantOrgId = req.tenantId;
  if (status) filter.status = { $in: String(status).split(",").map((s) => s.trim()).filter(Boolean) };
  if (severity) filter.severity = { $in: String(severity).split(",").map((s) => s.trim()).filter(Boolean) };
  if (supplierId) filter.supplierId = supplierId;
  if (auditId) filter.auditId = auditId;
  if (issueId) filter.issueId = issueId;

  // Role-based scoping
  if (req.user?.role === "auditor") {
    filter.auditorId = req.user._id;
  } else if (req.user?.role === "buyer") {
    filter.buyerId = req.user._id;
  } else if (req.user?.role === "supplier" || req.user?.role === "supplierUser") {
    filter.supplierId = req.user._id;
  } else if (req.user?.role === "tenant_admin") {
    // tenant admin stays within tenant boundary already set
  }
  return filter;
};

const buildSort = (sort) => {
  if (!sort) return { lastActivityAt: -1 };
  const [field, dir] = String(sort).split(":");
  return { [field]: dir === "asc" ? 1 : -1 };
};

export const listCapas = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const filter = buildCapaFilter(req);
    const sort = buildSort(req.query.sort);

    const [items, total] = await Promise.all([
      Capa.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize),
      Capa.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      meta: { total, page, limit: pageSize },
    });
  } catch (error) {
    console.error("listCapas error", error);
    return res.status(500).json({ success: false, error: "Failed to load CAPAs" });
  }
};

export const getCapa = async (req, res) => {
  try {
    const filter = buildCapaFilter(req);
    filter._id = req.params.id;
    const capa = await Capa.findOne(filter);
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("getCapa error", error);
    return res.status(500).json({ success: false, error: "Failed to load CAPA" });
  }
};

export const createCapa = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      tenantOrgId: req.tenantId || req.body.tenantOrgId || null,
      lastActivityAt: new Date(),
      createdBy: req.user?._id,
    };
    const capa = await Capa.create(payload);
    const shouldNotify = ["NEEDS_SUPPLIER", "REWORK_REQUESTED"].includes(capa.status) || Boolean(capa.ownerId);
    if (shouldNotify) {
      const recipientUserIds = await resolveCapaRecipients(capa);
      await notifyCapa({ tenantId: payload.tenantOrgId, capa, recipientUserIds, severity: "warning" });
    }
    return res.status(201).json({ success: true, data: capa });
  } catch (error) {
    console.error("createCapa error", error);
    return res.status(400).json({ success: false, error: "Failed to create CAPA" });
  }
};

export const updateCapaStatus = async (req, res) => {
  try {
    const { status, actionNote } = req.body;
    const allowedStatuses = ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", "REWORK_REQUESTED", "APPROVED", "CLOSED", "OVERDUE"];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const filter = buildCapaFilter(req);
    filter._id = req.params.id;
    const update = {
      status,
      lastActivityAt: new Date(),
      updatedBy: req.user?._id,
    };
    if (actionNote) {
      update.$push = {
        actions: {
          actorId: req.user?._id,
          actorRole: req.user?.role,
          visibility: "internal",
          message: actionNote,
        },
      };
    }
    const capa = await Capa.findOneAndUpdate(filter, update, { new: true });
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    if (["NEEDS_SUPPLIER", "REWORK_REQUESTED"].includes(status)) {
      const recipientUserIds = await resolveCapaRecipients(capa);
      await notifyCapa({ tenantId: capa.tenantOrgId || req.tenantId, capa, recipientUserIds, severity: "warning" });
    }
    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("updateCapaStatus error", error);
    return res.status(400).json({ success: false, error: "Failed to update CAPA" });
  }
};

export const addCapaAction = async (req, res) => {
  try {
    const { message, visibility = "internal", attachments = [] } = req.body;
    const filter = buildCapaFilter(req);
    filter._id = req.params.id;
    const update = {
      $push: {
        actions: {
          actorId: req.user?._id,
          actorRole: req.user?.role,
          visibility,
          message,
          attachments,
          createdAt: new Date(),
        },
      },
      lastActivityAt: new Date(),
      updatedBy: req.user?._id,
    };
    const capa = await Capa.findOneAndUpdate(filter, update, { new: true });
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("addCapaAction error", error);
    return res.status(400).json({ success: false, error: "Failed to append CAPA action" });
  }
};

export const updateCapaLinks = async (req, res) => {
  try {
    const { linkedQuestionIds, linkedObservationIds, linkedEvidenceIds, findingId } = req.body || {};
    const filter = buildCapaFilter(req);
    filter._id = req.params.id;
    const update = {
      updatedBy: req.user?._id,
      lastActivityAt: new Date(),
    };
    if (Array.isArray(linkedQuestionIds)) update.linkedQuestionIds = linkedQuestionIds;
    if (Array.isArray(linkedObservationIds)) update.linkedObservationIds = linkedObservationIds;
    if (Array.isArray(linkedEvidenceIds)) update.linkedEvidenceIds = linkedEvidenceIds;
    if (findingId !== undefined) update.findingId = findingId;
    const capa = await Capa.findOneAndUpdate(filter, update, { new: true });
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("updateCapaLinks error", error);
    return res.status(400).json({ success: false, error: "Failed to update CAPA links" });
  }
};
