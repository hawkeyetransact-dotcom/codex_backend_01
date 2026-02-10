import { AvailabilityBlock } from "../../models/availabilityBlockModel.js";
import { ScheduleSlot } from "../../models/scheduleSlotModel.js";

const parseTime = (value) => {
  if (!value || typeof value !== "string") return { hours: 9, minutes: 0 };
  const [h, m] = value.split(":").map((v) => Number(v));
  return {
    hours: Number.isNaN(h) ? 9 : h,
    minutes: Number.isNaN(m) ? 0 : m,
  };
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const setTime = (date, timeValue) => {
  const { hours, minutes } = parseTime(timeValue);
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

const overlaps = (slotStart, slotEnd, blockStart, blockEnd) =>
  slotStart < blockEnd && slotEnd > blockStart;

const scoreByFit = (slot, blocks, ownerType) => {
  const scoped = blocks.filter((b) => b.ownerType === ownerType);
  const blackout = scoped.filter((b) => b.blockType === "blackout");
  if (blackout.some((b) => overlaps(slot.start, slot.end, b.start, b.end))) {
    return { allowed: false, inAvailable: false, score: 0 };
  }
  const available = scoped.filter((b) => b.blockType === "available");
  const inAvailable = available.some((b) => slot.start >= b.start && slot.end <= b.end);
  return { allowed: true, inAvailable, score: inAvailable ? 25 : 10 };
};

const clampScore = (value) => Math.max(0, Math.min(25, Math.round(value)));

export const generateCandidateSlots = (schedule) => {
  const windowStart = schedule.auditWindowStart ? new Date(schedule.auditWindowStart) : new Date();
  const windowEnd = schedule.auditWindowEnd
    ? new Date(schedule.auditWindowEnd)
    : addDays(windowStart, 30);
  const durationDays = Math.max(Number(schedule.durationDays || 1), 1);
  const dailyStart = schedule.dailyStart || "09:00";
  const dailyEnd = schedule.dailyEnd || "17:00";

  const totalWindowDays = Math.max(
    1,
    Math.ceil((windowEnd.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000))
  );

  const candidates = [];
  let cursor = startOfDay(windowStart);
  const endCursor = startOfDay(windowEnd);

  while (cursor <= endCursor) {
    const slotStart = setTime(cursor, dailyStart);
    const slotEnd = setTime(addDays(cursor, durationDays - 1), dailyEnd);

    if (slotEnd <= windowEnd) {
      const diffDays = Math.max(
        0,
        Math.floor((slotStart.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000))
      );
      const slaFit = clampScore(25 * (1 - diffDays / totalWindowDays));
      candidates.push({
        start: slotStart,
        end: slotEnd,
        slaFit,
      });
    }

    cursor = addDays(cursor, 1);
  }

  return candidates;
};

export const scoreCandidateSlots = (candidates, schedule, availabilityBlocks) => {
  return candidates
    .map((slot) => {
      const auditorFit = scoreByFit(slot, availabilityBlocks, "auditor");
      const supplierFit = scoreByFit(slot, availabilityBlocks, "supplierSite");
      if (!auditorFit.allowed || !supplierFit.allowed) return null;

      const travelFit = schedule.mode === "ONSITE" || schedule.mode === "HYBRID" ? 25 : 25;
      const scoreBreakdown = {
        auditorFit: auditorFit.score,
        supplierFit: supplierFit.score,
        slaFit: slot.slaFit,
        travelFit,
      };
      const scoreTotal =
        scoreBreakdown.auditorFit +
        scoreBreakdown.supplierFit +
        scoreBreakdown.slaFit +
        scoreBreakdown.travelFit;
      return { ...slot, scoreTotal, scoreBreakdown };
    })
    .filter(Boolean);
};

export const loadAvailabilityBlocks = async (tenantOrgId, audit, windowStart, windowEnd) => {
  const ownerIds = [];
  if (audit?.auditor_id) ownerIds.push(audit.auditor_id);
  if (audit?.site_id) ownerIds.push(audit.site_id);
  if (!ownerIds.length) return [];

  return AvailabilityBlock.find({
    tenantOrgId,
    ownerId: { $in: ownerIds },
    start: { $lte: windowEnd },
    end: { $gte: windowStart },
  }).lean();
};

export const refreshScheduleSlots = async (audit, schedule, options = {}) => {
  const limit = options.limit || 5;
  const tenantOrgId = schedule.tenantOrgId;
  const candidates = generateCandidateSlots(schedule);
  const availabilityBlocks = await loadAvailabilityBlocks(
    tenantOrgId,
    audit,
    schedule.auditWindowStart || new Date(),
    schedule.auditWindowEnd || addDays(new Date(), 30)
  );
  const scored = scoreCandidateSlots(candidates, schedule, availabilityBlocks);
  const top = scored.sort((a, b) => b.scoreTotal - a.scoreTotal).slice(0, limit);

  await ScheduleSlot.deleteMany({ auditRequestId: audit._id, status: "candidate" });
  const docs = top.map((slot) => ({
    tenantOrgId,
    auditRequestId: audit._id,
    start: slot.start,
    end: slot.end,
    status: "candidate",
    scoreTotal: slot.scoreTotal,
    scoreBreakdown: slot.scoreBreakdown,
  }));
  const saved = await ScheduleSlot.insertMany(docs);
  return saved;
};

export const expireHolds = async (auditId) => {
  const now = new Date();
  await ScheduleSlot.updateMany(
    { auditRequestId: auditId, status: "held", holdExpiresAt: { $lt: now } },
    { $set: { status: "expired" } }
  );
};

export const holdSlot = async (auditId, slotId, userId, holdHours = 24) => {
  const holdExpiresAt = new Date(Date.now() + holdHours * 60 * 60 * 1000);
  const slot = await ScheduleSlot.findOneAndUpdate(
    { _id: slotId, auditRequestId: auditId, status: { $in: ["candidate", "proposed"] } },
    { $set: { status: "held", heldByUserId: userId, holdExpiresAt } },
    { new: true }
  );
  return slot;
};

export const proposeSlot = async (auditId, slotId, userId) =>
  ScheduleSlot.findOneAndUpdate(
    { _id: slotId, auditRequestId: auditId, status: "candidate" },
    { $set: { status: "proposed", proposedByUserId: userId } },
    { new: true }
  );

export const acceptSlot = async (auditId, slotId, userId) =>
  ScheduleSlot.findOneAndUpdate(
    { _id: slotId, auditRequestId: auditId, status: { $in: ["proposed", "held"] } },
    { $set: { status: "accepted", acceptedByUserId: userId } },
    { new: true }
  );

export const confirmSlot = async (auditId, slotId) => {
  await ScheduleSlot.updateMany(
    {
      auditRequestId: auditId,
      _id: { $ne: slotId },
      status: { $in: ["candidate", "proposed", "held", "accepted"] },
    },
    { $set: { status: "rejected" } }
  );
  return ScheduleSlot.findOneAndUpdate(
    {
      _id: slotId,
      auditRequestId: auditId,
      status: { $in: ["candidate", "proposed", "held", "accepted"] },
    },
    { $set: { status: "confirmed" } },
    { new: true }
  );
};

export const blockSlot = async ({
  tenantOrgId,
  auditId,
  start,
  end,
  userId,
  visibility = "free_busy",
  title = "",
  notes = "",
}) => {
  const slot = await ScheduleSlot.create({
    tenantOrgId,
    auditRequestId: auditId,
    start,
    end,
    status: "blocked",
    visibility,
    title,
    notes,
    blockedByUserId: userId,
    createdByUserId: userId,
    scoreTotal: 0,
    scoreBreakdown: {
      auditorFit: 0,
      supplierFit: 0,
      slaFit: 0,
      travelFit: 0,
    },
  });
  return slot;
};

export const unblockSlot = async (auditId, slotId) =>
  ScheduleSlot.findOneAndDelete({
    _id: slotId,
    auditRequestId: auditId,
    status: "blocked",
  });
