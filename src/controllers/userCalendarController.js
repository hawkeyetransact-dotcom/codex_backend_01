import { AvailabilityBlock } from "../models/availabilityBlockModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import {
  RESERVATION_BLOCK_SOURCE,
  isReservationBlock,
  resolveAuditReservationWindow,
} from "../services/calendarReservationService.js";

const EDITABLE_BLOCK_TYPES = new Set(["available", "blackout"]);

const normalizeRole = (value) => String(value || "").toLowerCase().replace(/[\s_-]/g, "");

const readText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const overlapsRange = (start, end, rangeStart, rangeEnd) => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return false;
  if (rangeStart && endDate <= rangeStart) return false;
  if (rangeEnd && startDate >= rangeEnd) return false;
  return true;
};

const resolveCalendarOwner = (req) => {
  const normalizedRole = normalizeRole(req.user?.role);
  if (normalizedRole === "auditor") {
    return { ownerType: "auditor", ownerId: req.user?._id, role: "auditor" };
  }
  if (normalizedRole === "supplier") {
    return { ownerType: "supplier", ownerId: req.user?._id, role: "supplier" };
  }
  if (normalizedRole === "supplieruser") {
    return {
      ownerType: "supplier",
      ownerId: req.user?.invitedBy || req.user?._id,
      role: "supplier",
    };
  }
  return { ownerType: null, ownerId: null, role: normalizedRole };
};

const resolveCalendarNames = async (audits = []) => {
  const buyerIds = audits
    .map((audit) => audit?.create_by_buyer_id?._id || audit?.create_by_buyer_id)
    .filter(Boolean);
  const supplierIds = audits
    .map((audit) => audit?.supplier_id?._id || audit?.supplier_id)
    .filter(Boolean);
  const [buyerProfiles, supplierProfiles] = await Promise.all([
    buyerIds.length
      ? BuyerProfile.find({ user_id: { $in: buyerIds } }).select("user_id firstName lastName companyName").lean()
      : Promise.resolve([]),
    supplierIds.length
      ? SupplierProfile.find({ user_id: { $in: supplierIds } }).select("user_id firstName lastName companyName").lean()
      : Promise.resolve([]),
  ]);
  const buyerMap = new Map(buyerProfiles.map((profile) => [String(profile.user_id), profile]));
  const supplierMap = new Map(supplierProfiles.map((profile) => [String(profile.user_id), profile]));
  return { buyerMap, supplierMap };
};

const toReservationPayload = (audit, buyerMap, supplierMap) => {
  const { start, end } = resolveAuditReservationWindow(audit);
  const buyerUser = audit?.create_by_buyer_id;
  const supplierUser = audit?.supplier_id;
  const site = audit?.site_id;
  const product = audit?.supplier_product_id;
  const auditLabel = readText(
    audit?.hawkeyeRequestId,
    audit?.internalRequestId,
    audit?.supplierRequestId,
    String(audit?._id || "")
  );
  const buyerProfile = buyerMap.get(String(buyerUser?._id || buyerUser || ""));
  const supplierProfile = supplierMap.get(String(supplierUser?._id || supplierUser || ""));
  const buyerName = readText(
    buyerProfile?.companyName,
    [buyerProfile?.firstName, buyerProfile?.lastName].filter(Boolean).join(" "),
    buyerUser?.email,
    "Buyer"
  );
  const auditeeName = readText(
    supplierProfile?.companyName,
    [supplierProfile?.firstName, supplierProfile?.lastName].filter(Boolean).join(" "),
    supplierUser?.email,
    "Auditee"
  );
  const location = readText(
    site?.site_name,
    [site?.city, site?.state, site?.country].filter(Boolean).join(", "),
    "Location"
  );
  const productName = readText(product?.name, product?.description, "Product");
  return {
    _id: String(audit._id),
    auditId: String(audit._id),
    auditLabel,
    start: start.toISOString(),
    end: end.toISOString(),
    buyerName,
    auditeeName,
    location,
    productName,
    details: `Audit: ${auditLabel} | Buyer: ${buyerName} | Auditee: ${auditeeName} | Location: ${location}`,
  };
};

export const listMyCalendar = async (req, res) => {
  try {
    const { ownerType, ownerId, role } = resolveCalendarOwner(req);
    if (!ownerType || !ownerId) {
      return res.status(403).json({ error: `Calendar is not enabled for role ${role || "unknown"}` });
    }

    const rangeStart = parseDate(req.query?.from);
    const rangeEnd = parseDate(req.query?.to);

    const blockQuery = {
      ownerType,
      ownerId,
    };
    if (rangeEnd) blockQuery.start = { $lt: rangeEnd };
    if (rangeStart) blockQuery.end = { $gt: rangeStart };

    const allBlocks = await AvailabilityBlock.find(blockQuery).sort({ start: 1 }).lean();
    const blocks = allBlocks.filter((block) => !isReservationBlock(block));

    const reservationQuery = {
      isArchived: { $ne: true },
    };
    if (ownerType === "auditor") {
      reservationQuery.auditor_id = ownerId;
      reservationQuery.auditorDecision = "ACCEPTED";
    } else {
      reservationQuery.supplier_id = ownerId;
      reservationQuery.supplierDecision = "ACCEPTED";
    }

    const audits = await AuditRequestMaster.find(reservationQuery)
      .select(
        "_id hawkeyeRequestId internalRequestId supplierRequestId create_by_buyer_id supplier_id supplier_product_id site_id calendarStartAt calendarEndAt calendarDurationDays auditETA complianceDate"
      )
      .populate("create_by_buyer_id", "email")
      .populate("supplier_id", "email")
      .populate("supplier_product_id", "name description")
      .populate("site_id", "site_name city state country")
      .sort({ updatedAt: -1 })
      .lean();

    const { buyerMap, supplierMap } = await resolveCalendarNames(audits);
    const reservations = audits
      .map((audit) => toReservationPayload(audit, buyerMap, supplierMap))
      .filter((reservation) =>
        overlapsRange(reservation.start, reservation.end, rangeStart, rangeEnd)
      )
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return res.json({
      success: true,
      data: {
        ownerType,
        ownerId: String(ownerId),
        blocks,
        reservations,
      },
    });
  } catch (error) {
    console.error("listMyCalendar", error);
    return res.status(500).json({ error: "Failed to load calendar" });
  }
};

export const createMyAvailability = async (req, res) => {
  try {
    const { ownerType, ownerId, role } = resolveCalendarOwner(req);
    if (!ownerType || !ownerId) {
      return res.status(403).json({ error: `Calendar is not enabled for role ${role || "unknown"}` });
    }

    const { start, end, blockType = "blackout", timezone = "UTC" } = req.body || {};
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate || endDate <= startDate) {
      return res.status(400).json({ error: "Invalid start/end" });
    }

    const normalizedBlockType = String(blockType || "").toLowerCase().trim();
    if (!EDITABLE_BLOCK_TYPES.has(normalizedBlockType)) {
      return res.status(400).json({ error: "blockType must be available or blackout" });
    }

    const block = await AvailabilityBlock.create({
      tenantOrgId: req.tenantId || req.user?.tenant_id || null,
      ownerType,
      ownerId,
      blockType: normalizedBlockType,
      start: startDate,
      end: endDate,
      timezone: String(timezone || "UTC"),
      conditions: {
        source: "manual",
      },
      createdBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: block });
  } catch (error) {
    console.error("createMyAvailability", error);
    return res.status(500).json({ error: "Failed to create availability block" });
  }
};

export const deleteMyAvailability = async (req, res) => {
  try {
    const { ownerType, ownerId, role } = resolveCalendarOwner(req);
    if (!ownerType || !ownerId) {
      return res.status(403).json({ error: `Calendar is not enabled for role ${role || "unknown"}` });
    }

    const block = await AvailabilityBlock.findOne({
      _id: req.params.blockId,
      ownerType,
      ownerId,
    });
    if (!block) return res.status(404).json({ error: "Availability block not found" });
    if (isReservationBlock(block) || String(block?.conditions?.source || "") === RESERVATION_BLOCK_SOURCE) {
      return res.status(400).json({ error: "Accepted-audit reservation blocks cannot be deleted manually" });
    }

    await block.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    console.error("deleteMyAvailability", error);
    return res.status(500).json({ error: "Failed to delete availability block" });
  }
};
