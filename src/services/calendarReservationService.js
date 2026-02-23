import { AvailabilityBlock } from "../models/availabilityBlockModel.js";

export const RESERVATION_BLOCK_SOURCE = "audit_reservation";

const DEFAULT_RESERVATION_DAYS = 5;
const MIN_RESERVATION_DAYS = 1;
const MAX_RESERVATION_DAYS = 30;

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const normalizeReservationDays = (value, fallback = DEFAULT_RESERVATION_DAYS) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    const normalizedFallback = Number(fallback);
    if (!Number.isFinite(normalizedFallback)) return DEFAULT_RESERVATION_DAYS;
    return Math.min(MAX_RESERVATION_DAYS, Math.max(MIN_RESERVATION_DAYS, Math.round(normalizedFallback)));
  }
  return Math.min(MAX_RESERVATION_DAYS, Math.max(MIN_RESERVATION_DAYS, Math.round(raw)));
};

export const resolveAuditReservationWindow = (audit) => {
  const days = normalizeReservationDays(audit?.calendarDurationDays, DEFAULT_RESERVATION_DAYS);
  const start =
    toValidDate(audit?.calendarStartAt) ||
    toValidDate(audit?.auditETA) ||
    toValidDate(audit?.complianceDate) ||
    new Date();
  let end = toValidDate(audit?.calendarEndAt);
  if (!end || end <= start) {
    end = addDays(start, days);
  }
  return { start, end, days };
};

export const applyAuditReservationWindow = ({ audit, durationDays } = {}) => {
  if (!audit) {
    const start = new Date();
    const days = normalizeReservationDays(durationDays, DEFAULT_RESERVATION_DAYS);
    return { start, end: addDays(start, days), days };
  }
  const days = normalizeReservationDays(durationDays, audit?.calendarDurationDays);
  const existingStart = toValidDate(audit.calendarStartAt);
  const baseStart =
    existingStart || toValidDate(audit.auditETA) || toValidDate(audit.complianceDate) || new Date();
  const start = baseStart;
  let end = toValidDate(audit.calendarEndAt);
  if (!end || end <= start) {
    end = addDays(start, days);
  }
  audit.calendarDurationDays = days;
  audit.calendarStartAt = start;
  audit.calendarEndAt = end;
  return { start, end, days };
};

export const isReservationBlock = (block) =>
  String(block?.conditions?.source || "").trim().toLowerCase() === RESERVATION_BLOCK_SOURCE;

export const upsertAuditReservationBlock = async ({
  audit,
  ownerType,
  ownerId,
  actorId,
  timezone = "UTC",
}) => {
  if (!audit || !ownerType || !ownerId) return null;
  const { start, end, days } = resolveAuditReservationWindow(audit);
  const filter = {
    ownerType,
    ownerId,
    "conditions.source": RESERVATION_BLOCK_SOURCE,
    "conditions.auditId": String(audit._id),
  };
  const update = {
    tenantOrgId: audit.tenantOrgId || null,
    ownerType,
    ownerId,
    blockType: "blackout",
    start,
    end,
    timezone: String(timezone || "UTC"),
    createdBy: actorId || null,
    conditions: {
      source: RESERVATION_BLOCK_SOURCE,
      auditId: String(audit._id),
      durationDays: days,
      buyerId: audit.create_by_buyer_id ? String(audit.create_by_buyer_id) : null,
      supplierId: audit.supplier_id ? String(audit.supplier_id) : null,
      auditorId: audit.auditor_id ? String(audit.auditor_id) : null,
      siteId: audit.site_id ? String(audit.site_id) : null,
      productId: audit.supplier_product_id ? String(audit.supplier_product_id) : null,
      ownerType,
    },
  };
  return AvailabilityBlock.findOneAndUpdate(filter, { $set: update }, { new: true, upsert: true });
};

export const removeAuditReservationBlock = async ({ auditId, ownerType, ownerId }) => {
  if (!auditId || !ownerType || !ownerId) return null;
  return AvailabilityBlock.findOneAndDelete({
    ownerType,
    ownerId,
    "conditions.source": RESERVATION_BLOCK_SOURCE,
    "conditions.auditId": String(auditId),
  });
};
