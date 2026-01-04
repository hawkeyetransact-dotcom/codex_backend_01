import { Capa } from "../models/capaModel.js";

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
