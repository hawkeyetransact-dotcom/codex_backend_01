import mongoose from "mongoose";
import { InternalCAPAReference } from "../../models/InternalCAPAReference.js";

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const normalizeSeverity = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (["critical", "high"].includes(raw)) return "Critical";
  if (["major", "medium"].includes(raw)) return "Major";
  if (["minor", "low"].includes(raw)) return "Minor";
  if (["info", "informational"].includes(raw)) return "Info";
  return "Unknown";
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeExternalSystem = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (["TRACKWISE", "MASTERCONTROL", "VEEVA", "EUROFINS"].includes(raw)) return raw;
  return "OTHER";
};

const normalizeRecord = ({ record = {}, tenantId, externalSystem, connectionId }) => {
  const externalCAPAId = String(
    record.externalCAPAId || record.externalCapaId || record.eventId || record.internalCapaId || ""
  ).trim();
  if (!externalCAPAId) return null;

  return {
    tenantId: toObjectIdOrNull(tenantId),
    connectionId: toObjectIdOrNull(connectionId),
    internalCapaId: String(record.internalCapaId || `${externalSystem}:${externalCAPAId}`),
    externalSystem: normalizeExternalSystem(externalSystem),
    externalCAPAId,
    siteId: toObjectIdOrNull(record.siteId),
    supplierId: toObjectIdOrNull(record.supplierId),
    severity: normalizeSeverity(record.severity),
    status: String(record.status || "Open"),
    openedDate: normalizeDate(record.openedDate),
    closedDate: normalizeDate(record.closedDate),
    dueDate: normalizeDate(record.dueDate),
    riskCategory: String(record.riskCategory || "GENERAL"),
    sourceAuditId: toObjectIdOrNull(record.sourceAuditId),
    sourceEventId: record.sourceEventId ? String(record.sourceEventId) : undefined,
    source: "eQMS",
    metadata: record.metadata || {},
  };
};

export const upsertInternalCapaRecords = async ({
  tenantId,
  externalSystem,
  records = [],
  connectionId,
} = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  if (!externalSystem) throw new Error("externalSystem is required");

  const operations = [];
  records.forEach((record) => {
    const normalized = normalizeRecord({ record, tenantId, externalSystem, connectionId });
    if (!normalized) return;
    operations.push({
      updateOne: {
        filter: {
          tenantId: normalized.tenantId,
          externalSystem: normalized.externalSystem,
          externalCAPAId: normalized.externalCAPAId,
        },
        update: { $set: normalized },
        upsert: true,
      },
    });
  });

  if (!operations.length) {
    return { insertedOrUpdated: 0, skipped: records.length };
  }

  const result = await InternalCAPAReference.bulkWrite(operations, { ordered: false });
  const insertedOrUpdated =
    Number(result.upsertedCount || 0) + Number(result.modifiedCount || 0) + Number(result.matchedCount || 0);

  return {
    insertedOrUpdated,
    skipped: Math.max(0, records.length - operations.length),
  };
};
