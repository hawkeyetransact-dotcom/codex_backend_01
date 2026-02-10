import { AuditSchedule } from "../models/auditScheduleModel.js";
import { AvailabilityBlock } from "../models/availabilityBlockModel.js";
import { ScheduleSlot } from "../models/scheduleSlotModel.js";
import { ScheduleEventLog } from "../models/scheduleEventLogModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { User } from "../models/userModel.js";
import {
  refreshScheduleSlots,
  expireHolds,
  holdSlot,
  acceptSlot,
  confirmSlot,
  proposeSlot,
  blockSlot,
  unblockSlot,
} from "../services/scheduling/schedulingService.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const SLOT_VISIBILITY = new Set(["full", "free_busy", "private"]);
const BLOCKING_ROLES = new Set(["buyer", "auditor", "tenant_admin", "admin", "superadmin"]);

const toId = (value) => (value ? value.toString() : "");
const parseDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeVisibility = (value) => {
  const normalized = String(value || "free_busy").trim().toLowerCase();
  return SLOT_VISIBILITY.has(normalized) ? normalized : "free_busy";
};

const maskSlotForRole = (slot, roleInfo) => {
  if (!slot || !roleInfo?.isSupplier) return slot;
  if (slot.status !== "blocked") return slot;
  if (slot.visibility === "full") return slot;

  return {
    ...slot,
    title: slot.visibility === "private" ? "Private" : "Busy",
    notes: "",
    scoreTotal: undefined,
    scoreBreakdown: undefined,
    masked: true,
  };
};

const ensureAuditAccess = async (audit, req) => {
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  if (audit.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  const role = req.user?.role;
  if (ADMIN_ROLES.has(role)) return { role, isAdmin: true };

  const userId = toId(req.user?._id);
  const isBuyer = userId && userId === toId(audit.create_by_buyer_id);
  const isAuditor = userId && userId === toId(audit.auditor_id);
  const isSupplier = userId && userId === toId(audit.supplier_id);
  let isSupplierTenant = false;
  if ((role === "supplier" || role === "supplierUser") && !isSupplier) {
    const supplierUser = await User.findById(audit.supplier_id).select("tenant_id").lean();
    const supplierTenantId = toId(supplierUser?.tenant_id);
    const userTenantId = toId(req.user?.tenant_id);
    if (supplierTenantId && userTenantId && supplierTenantId === userTenantId) {
      isSupplierTenant = true;
    }
  }
  const allowed = isBuyer || isAuditor || isSupplier || isSupplierTenant;

  if (!allowed) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  return { role, isBuyer, isAuditor, isSupplier: isSupplier || isSupplierTenant, isAdmin: false };
};

const logEvent = async (auditId, req, eventType, payload, notes) =>
  ScheduleEventLog.create({
    auditRequestId: auditId,
    tenantOrgId: req.tenantId,
    eventType,
    actorUserId: req.user?._id,
    actorRole: req.user?.role,
    payload,
    notes,
  });

const ensureScheduleUnlocked = async (auditId, roleInfo) => {
  const schedule = await AuditSchedule.findOne({ auditRequestId: auditId }).lean();
  if (schedule?.status === "CONFIRMED" && !roleInfo.isAdmin) {
    const err = new Error("Schedule is locked. Only admin can unlock.");
    err.status = 403;
    throw err;
  }
  return schedule;
};

const pickScheduleUpdates = (roleInfo, body) => {
  const update = {};
  if (roleInfo.isAdmin || roleInfo.isBuyer) {
    [
      "mode",
      "timezone",
      "durationDays",
      "dailyStart",
      "dailyEnd",
      "auditWindowStart",
      "auditWindowEnd",
      "buyerConstraints",
    ].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) update[key] = body[key];
    });
  }
  if (roleInfo.isAdmin || roleInfo.isAuditor) {
    if (Object.prototype.hasOwnProperty.call(body, "auditorConstraints")) update.auditorConstraints = body.auditorConstraints;
  }
  if (roleInfo.isAdmin || roleInfo.isSupplier) {
    if (Object.prototype.hasOwnProperty.call(body, "supplierConstraints")) update.supplierConstraints = body.supplierConstraints;
  }
  return update;
};

const resolveAvailabilityOwner = (audit, req) => {
  const role = req.user?.role;
  if (ADMIN_ROLES.has(role)) {
    return {
      ownerType: req.body?.ownerType,
      ownerId: req.body?.ownerId,
    };
  }
  if (role === "auditor") return { ownerType: "auditor", ownerId: audit.auditor_id };
  if (role === "supplier" || role === "supplierUser") return { ownerType: "supplierSite", ownerId: audit.site_id };
  if (role === "buyer") return { ownerType: "buyer", ownerId: req.user?._id };
  return { ownerType: undefined, ownerId: undefined };
};

export const initSchedule = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    const existing = await AuditSchedule.findOne({ auditRequestId: audit._id });
    if (existing) return res.json({ success: true, data: existing });

    const payload = pickScheduleUpdates(roleInfo, req.body || {});
    const defaultWindowStart = new Date();
    const eta = audit?.auditETA || audit?.complianceDate || null;
    const defaultWindowEnd = eta ? new Date(eta) : null;
    if (!payload.auditWindowStart) {
      payload.auditWindowStart = defaultWindowStart;
    }
    if (!payload.auditWindowEnd && defaultWindowEnd) {
      payload.auditWindowEnd = defaultWindowEnd;
    }
    const schedule = await AuditSchedule.create({
      tenantOrgId: audit.tenantOrgId || req.tenantId,
      auditRequestId: audit._id,
      createdBy: req.user?._id,
      ...payload,
    });
    await logEvent(audit._id, req, "SCHEDULE_INIT", { scheduleId: schedule._id });
    return res.json({ success: true, data: schedule });
  } catch (err) {
    console.error("initSchedule", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to init schedule" });
  }
};

export const getSchedule = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await expireHolds(audit._id);
    const schedule = await AuditSchedule.findOne({ auditRequestId: audit._id }).lean();
    const slots = await ScheduleSlot.find({ auditRequestId: audit._id }).sort({ start: 1, scoreTotal: -1 }).lean();
    const visibleSlots = slots.map((slot) => maskSlotForRole(slot, roleInfo));
    return res.json({ success: true, data: { schedule, slots: visibleSlots } });
  } catch (err) {
    console.error("getSchedule", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load schedule" });
  }
};

export const updateSchedule = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    const update = pickScheduleUpdates(roleInfo, req.body || {});
    const schedule = await AuditSchedule.findOneAndUpdate(
      { auditRequestId: audit._id },
      { $set: update },
      { new: true, upsert: true }
    );
    await logEvent(audit._id, req, "SCHEDULE_UPDATE", { update });
    return res.json({ success: true, data: schedule });
  } catch (err) {
    console.error("updateSchedule", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to update schedule" });
  }
};

export const getSuggestions = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    const schedule = await AuditSchedule.findOne({ auditRequestId: audit._id });
    if (!schedule) return res.status(400).json({ error: "Schedule not initialized" });
    const refreshed = await refreshScheduleSlots(audit, schedule);
    const allSlots = await ScheduleSlot.find({ auditRequestId: audit._id }).sort({ start: 1, scoreTotal: -1 }).lean();
    const visibleSlots = allSlots.map((slot) => maskSlotForRole(slot, roleInfo));
    await logEvent(audit._id, req, "SLOTS_REFRESH", { count: refreshed.length });
    return res.json({ success: true, data: visibleSlots });
  } catch (err) {
    console.error("getSuggestions", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to generate slots" });
  }
};

export const proposeScheduleSlot = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    if (!roleInfo.isBuyer && !roleInfo.isAdmin && !roleInfo.isSupplier) {
      return res.status(403).json({ error: "Only buyer or supplier can propose slots" });
    }
    const slot = await proposeSlot(audit._id, req.params.slotId, req.user?._id);
    if (!slot) return res.status(400).json({ error: "Slot cannot be proposed in its current state" });
    await logEvent(audit._id, req, "SLOT_PROPOSED", { slotId: slot?._id });
    if (roleInfo.isSupplier) {
      audit.trackStatus = "Supplier proposed date";
      audit.nextAuditOn = audit.auditor_id ? "auditor" : "buyer";
      await audit.save();
    }
    return res.json({ success: true, data: slot });
  } catch (err) {
    console.error("proposeScheduleSlot", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to propose slot" });
  }
};

export const holdScheduleSlot = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    if (!roleInfo.isAuditor && !roleInfo.isAdmin) {
      return res.status(403).json({ error: "Only auditor can hold slots" });
    }
    const slot = await holdSlot(audit._id, req.params.slotId, req.user?._id, 24);
    if (!slot) return res.status(400).json({ error: "Slot cannot be held in its current state" });
    await logEvent(audit._id, req, "SLOT_HELD", { slotId: slot?._id, holdExpiresAt: slot?.holdExpiresAt });
    return res.json({ success: true, data: slot });
  } catch (err) {
    console.error("holdScheduleSlot", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to hold slot" });
  }
};

export const createBlockedSlot = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    const role = req.user?.role;
    if (!BLOCKING_ROLES.has(role)) {
      return res.status(403).json({ error: "Only buyer/auditor/admin can block slots" });
    }
    const start = parseDate(req.body?.start);
    const end = parseDate(req.body?.end);
    if (!start || !end || end <= start) {
      return res.status(400).json({ error: "Valid start/end are required" });
    }
    const visibility = normalizeVisibility(req.body?.visibility);
    const title = String(req.body?.title || "").trim();
    const notes = String(req.body?.notes || "").trim();

    const slot = await blockSlot({
      tenantOrgId: audit.tenantOrgId || req.tenantId,
      auditId: audit._id,
      start,
      end,
      userId: req.user?._id,
      visibility,
      title,
      notes,
    });
    await logEvent(audit._id, req, "SLOT_BLOCKED", {
      slotId: slot?._id,
      visibility,
      start,
      end,
    });
    return res.json({ success: true, data: slot });
  } catch (err) {
    console.error("createBlockedSlot", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to block slot" });
  }
};

export const deleteBlockedSlot = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    const role = req.user?.role;
    if (!BLOCKING_ROLES.has(role)) {
      return res.status(403).json({ error: "Only buyer/auditor/admin can unblock slots" });
    }
    const slotId = req.params.slotId;
    const slot = await ScheduleSlot.findOne({ _id: slotId, auditRequestId: audit._id }).lean();
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    if (slot.status !== "blocked") {
      return res.status(400).json({ error: "Only blocked slots can be removed" });
    }

    const removed = await unblockSlot(audit._id, slotId);
    if (!removed) return res.status(404).json({ error: "Blocked slot not found" });

    await logEvent(audit._id, req, "SLOT_UNBLOCKED", { slotId });
    return res.json({ success: true, data: { slotId } });
  } catch (err) {
    console.error("deleteBlockedSlot", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to unblock slot" });
  }
};

export const acceptScheduleSlot = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    if (!roleInfo.isSupplier && !roleInfo.isAuditor && !roleInfo.isAdmin) {
      return res.status(403).json({ error: "Only supplier or auditor can accept slots" });
    }
    const slot = await acceptSlot(audit._id, req.params.slotId, req.user?._id);
    if (!slot) return res.status(400).json({ error: "Slot cannot be accepted in its current state" });
    await logEvent(audit._id, req, "SLOT_ACCEPTED", { slotId: slot?._id });
    if (roleInfo.isAuditor) {
      audit.trackStatus = "Auditor accepted date";
      audit.nextAuditOn = "buyer";
      await audit.save();
    }
    return res.json({ success: true, data: slot });
  } catch (err) {
    console.error("acceptScheduleSlot", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to accept slot" });
  }
};

export const confirmSchedule = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    if (!roleInfo.isBuyer && !roleInfo.isAdmin) {
      return res.status(403).json({ error: "Only buyer can confirm schedule" });
    }
    const slotId = req.body?.slotId;
    if (!slotId) return res.status(400).json({ error: "slotId is required" });
    const existing = await AuditSchedule.findOne({ auditRequestId: audit._id }).lean();
    if (existing?.status === "CONFIRMED") {
      return res.status(409).json({ error: "Schedule already confirmed" });
    }
    const slot = await confirmSlot(audit._id, slotId);
    if (!slot) return res.status(400).json({ error: "Slot cannot be confirmed in its current state" });
    const schedule = await AuditSchedule.findOneAndUpdate(
      { auditRequestId: audit._id },
      { $set: { status: "CONFIRMED", confirmedSlotId: slotId } },
      { new: true }
    );
    await logEvent(audit._id, req, "SCHEDULE_CONFIRMED", { slotId });
    return res.json({ success: true, data: { schedule, slot } });
  } catch (err) {
    console.error("confirmSchedule", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to confirm schedule" });
  }
};

export const reschedule = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    if (!roleInfo.isAdmin) {
      return res.status(403).json({ error: "Only admin can unlock or reschedule" });
    }
    const schedule = await AuditSchedule.findOneAndUpdate(
      { auditRequestId: audit._id },
      { $set: { status: "RESCHEDULED", confirmedSlotId: null } },
      { new: true }
    );
    await ScheduleSlot.updateMany(
      {
        auditRequestId: audit._id,
        status: { $in: ["proposed", "held", "accepted", "confirmed", "expired", "rejected"] },
      },
      { $set: { status: "candidate" } }
    );
    await logEvent(audit._id, req, "SCHEDULE_RESCHEDULED", { scheduleId: schedule?._id });
    return res.json({ success: true, data: schedule });
  } catch (err) {
    console.error("reschedule", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to reschedule" });
  }
};

export const getScheduleTimeline = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    await ensureAuditAccess(audit, req);
    const logs = await ScheduleEventLog.find({ auditRequestId: audit._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: logs });
  } catch (err) {
    console.error("getScheduleTimeline", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load timeline" });
  }
};

export const postScheduleMessage = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    await ensureAuditAccess(audit, req);
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }
    const log = await logEvent(audit._id, req, "MESSAGE", { message });
    return res.json({ success: true, data: log });
  } catch (err) {
    console.error("postScheduleMessage", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to post message" });
  }
};

export const listAvailability = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    await ensureAuditAccess(audit, req);
    const ownerIds = [audit.auditor_id, audit.site_id].filter(Boolean);
    const blocks = await AvailabilityBlock.find({
      tenantOrgId: audit.tenantOrgId || req.tenantId,
      ownerId: { $in: ownerIds },
    }).lean();
    return res.json({ success: true, data: blocks });
  } catch (err) {
    console.error("listAvailability", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load availability" });
  }
};

export const createAvailability = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    const { ownerType, ownerId } = resolveAvailabilityOwner(audit, req);
    if (!ownerType || !ownerId) return res.status(400).json({ error: "ownerType/ownerId required" });
    const { blockType, start, end, timezone, conditions, recurrence } = req.body || {};
    const block = await AvailabilityBlock.create({
      tenantOrgId: audit.tenantOrgId || req.tenantId,
      ownerType,
      ownerId,
      blockType: blockType || "available",
      start: new Date(start),
      end: new Date(end),
      timezone: timezone || "UTC",
      conditions,
      recurrence,
      createdBy: req.user?._id,
    });
    await logEvent(audit._id, req, "AVAILABILITY_CREATE", { blockId: block._id });
    return res.json({ success: true, data: block });
  } catch (err) {
    console.error("createAvailability", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to create availability" });
  }
};

export const deleteAvailability = async (req, res) => {
  try {
    const audit = await AuditRequestMaster.findById(req.params.auditId);
    const roleInfo = await ensureAuditAccess(audit, req);
    await ensureScheduleUnlocked(audit._id, roleInfo);
    await AvailabilityBlock.findByIdAndDelete(req.params.blockId);
    await logEvent(audit._id, req, "AVAILABILITY_DELETE", { blockId: req.params.blockId });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteAvailability", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to delete availability" });
  }
};
