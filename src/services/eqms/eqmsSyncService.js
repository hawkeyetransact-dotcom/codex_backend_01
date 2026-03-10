import mongoose from "mongoose";
import { AuditRequestMaster } from "../../models/auditRequestsMasterModel.js";
import { Capa } from "../../models/capaModel.js";
import { ExternalCAPA } from "../../models/ExternalCAPA.js";
import { ExternalAudit } from "../../models/ExternalAudit.js";
import { InternalCAPAReference } from "../../models/InternalCAPAReference.js";
import { getEqmsConnector } from "../../integrations/eqms/registry.js";
import { upsertInternalCapaRecords } from "./internalCapaNormalizationService.js";

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const normalizeSeverity = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "critical") return "Critical";
  if (raw === "major") return "Major";
  if (raw === "minor") return "Minor";
  if (raw === "info") return "Info";
  return "Unknown";
};

const isOpenStatus = (value) => {
  const raw = String(value || "").toLowerCase();
  return !["closed", "approved", "completed", "resolved"].some((token) => raw.includes(token));
};

const buildExternalCapaProjection = (tenantId, capa = {}) => ({
  tenantId: toObjectIdOrNull(tenantId),
  externalCapaId: String(capa._id),
  auditObservationId: capa.issueId || capa.findingId || null,
  auditId: capa.auditId || null,
  supplierId: capa.supplierId || null,
  siteId: capa.metadata?.siteId ? toObjectIdOrNull(capa.metadata.siteId) : null,
  severity: normalizeSeverity(capa.severity),
  status: capa.status || "DRAFT",
  dueDate: capa.targetDate || null,
  closureEvidence: (capa.actions || []).flatMap((action) => action.attachments || []),
  createdDate: capa.createdAt || new Date(),
  closedDate: capa.closedAt || null,
  source: "Hawkeye",
  metadata: {
    tenantOrgId: capa.tenantOrgId,
    ownerId: capa.ownerId,
    linkedQuestionIds: capa.linkedQuestionIds || [],
    linkedObservationIds: capa.linkedObservationIds || [],
  },
});

const mapAuditType = (audit = {}) => {
  const explicit = String(audit.auditType || "").toUpperCase();
  if (
    ["INTERNAL_REFERENCE", "SUPPLIER_AUDIT", "REGULATORY_AUDIT", "PREQUALIFICATION_AUDIT", "SELF_ASSESSMENT"].includes(
      explicit
    )
  ) {
    return explicit;
  }
  return "SUPPLIER_AUDIT";
};

export const syncInternalCapasFromSystem = async ({
  tenantId,
  systemKey,
  supplierId,
  siteId,
  connectionId,
  limit = 500,
} = {}) => {
  const connector = getEqmsConnector(systemKey);
  if (!connector) {
    const err = new Error(`Unsupported system: ${systemKey}`);
    err.status = 400;
    throw err;
  }

  const syncResult = await connector.syncUpdates({
    tenantId: toObjectIdOrNull(tenantId),
    supplierId: toObjectIdOrNull(supplierId),
    siteId: toObjectIdOrNull(siteId),
    connectionId: toObjectIdOrNull(connectionId),
    limit: Number(limit || 500),
  });

  const upsertResult = await upsertInternalCapaRecords({
    tenantId,
    externalSystem: connector.systemKey.toUpperCase(),
    records: syncResult.capaRecords || [],
    connectionId,
  });

  return {
    system: connector.systemKey,
    fetched: {
      capaRecords: syncResult.capaRecords?.length || 0,
      auditRecords: syncResult.auditRecords?.length || 0,
      documents: syncResult.documents?.length || 0,
      effectivenessChecks: syncResult.effectivenessChecks?.length || 0,
      trainingRecords: syncResult.trainingRecords?.length || 0,
    },
    persisted: upsertResult,
  };
};

export const listInternalCapas = async ({
  tenantId,
  supplierId,
  siteId,
  externalSystem,
  status,
  limit = 100,
  page = 1,
} = {}) => {
  const query = { tenantId: toObjectIdOrNull(tenantId) };
  if (supplierId) query.supplierId = toObjectIdOrNull(supplierId);
  if (siteId) query.siteId = toObjectIdOrNull(siteId);
  if (externalSystem) query.externalSystem = String(externalSystem).toUpperCase();
  if (status) query.status = status;

  const safeLimit = Math.min(500, Math.max(1, Number(limit || 100)));
  const safePage = Math.max(1, Number(page || 1));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    InternalCAPAReference.find(query).sort({ openedDate: -1, createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    InternalCAPAReference.countDocuments(query),
  ]);

  return { items, page: safePage, limit: safeLimit, total };
};

export const syncExternalCapasFromHawkeye = async ({ tenantId } = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  const tenantString = String(tenantId);
  const capaDocs = await Capa.find({ tenantOrgId: tenantString }).lean();

  const operations = capaDocs.map((capa) => {
    const projection = buildExternalCapaProjection(tenantId, capa);
    return {
      updateOne: {
        filter: { tenantId: projection.tenantId, externalCapaId: projection.externalCapaId },
        update: { $set: projection },
        upsert: true,
      },
    };
  });

  if (operations.length) await ExternalCAPA.bulkWrite(operations, { ordered: false });
  return { processed: capaDocs.length };
};

export const listExternalCapas = async ({ tenantId, supplierId, siteId, status, limit = 100, page = 1 } = {}) => {
  const query = { tenantId: toObjectIdOrNull(tenantId) };
  if (supplierId) query.supplierId = toObjectIdOrNull(supplierId);
  if (siteId) query.siteId = toObjectIdOrNull(siteId);
  if (status) query.status = status;

  const safeLimit = Math.min(500, Math.max(1, Number(limit || 100)));
  const safePage = Math.max(1, Number(page || 1));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ExternalCAPA.find(query).sort({ createdDate: -1, updatedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    ExternalCAPA.countDocuments(query),
  ]);

  return { items, page: safePage, limit: safeLimit, total };
};

export const syncExternalAuditsFromHawkeye = async ({ tenantId } = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  const audits = await AuditRequestMaster.find({ tenantOrgId: String(tenantId), isArchived: { $ne: true } }).lean();

  const operations = audits.map((audit) => ({
    updateOne: {
      filter: { tenantId: toObjectIdOrNull(tenantId), auditId: String(audit._id) },
      update: {
        $set: {
          tenantId: toObjectIdOrNull(tenantId),
          auditId: String(audit._id),
          auditType: mapAuditType(audit),
          supplierId: toObjectIdOrNull(audit.supplier_id),
          siteId: toObjectIdOrNull(audit.site_id),
          auditDate: audit.complianceDate || audit.updatedAt || audit.createdAt,
          auditorId: toObjectIdOrNull(audit.auditor_id),
          status: audit.trackStatus || audit.questionnaireStatus || "UNKNOWN",
          source: "Hawkeye",
          metadata: {
            hawkeyeRequestId: audit.hawkeyeRequestId || "",
            internalRequestId: audit.internalRequestId || "",
            questionnaireStatus: audit.questionnaireStatus || "",
            phaseState: audit.phaseState || {},
          },
        },
      },
      upsert: true,
    },
  }));

  if (operations.length) await ExternalAudit.bulkWrite(operations, { ordered: false });
  return { processed: audits.length };
};

export const listExternalAudits = async ({ tenantId, supplierId, siteId, status, auditType, limit = 100, page = 1 } = {}) => {
  const query = { tenantId: toObjectIdOrNull(tenantId) };
  if (supplierId) query.supplierId = toObjectIdOrNull(supplierId);
  if (siteId) query.siteId = toObjectIdOrNull(siteId);
  if (status) query.status = status;
  if (auditType) query.auditType = auditType;

  const safeLimit = Math.min(500, Math.max(1, Number(limit || 100)));
  const safePage = Math.max(1, Number(page || 1));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ExternalAudit.find(query).sort({ auditDate: -1, updatedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    ExternalAudit.countDocuments(query),
  ]);

  return { items, page: safePage, limit: safeLimit, total };
};

export const listOpenCapasForRisk = async ({ tenantId, supplierId, siteId } = {}) => {
  const tenantObjectId = toObjectIdOrNull(tenantId);
  const supplierObjectId = toObjectIdOrNull(supplierId);
  const siteObjectId = toObjectIdOrNull(siteId);

  const internalQuery = { tenantId: tenantObjectId };
  const externalQuery = { tenantId: tenantObjectId };
  if (supplierObjectId) {
    internalQuery.supplierId = supplierObjectId;
    externalQuery.supplierId = supplierObjectId;
  }
  if (siteObjectId) {
    internalQuery.siteId = siteObjectId;
    externalQuery.siteId = siteObjectId;
  }

  const [internal, external] = await Promise.all([
    InternalCAPAReference.find(internalQuery).lean(),
    ExternalCAPA.find(externalQuery).lean(),
  ]);

  const internalNormalized = internal.map((row) => ({
    source: "eQMS",
    severity: row.severity,
    status: row.status,
    dueDate: row.dueDate,
    openedDate: row.openedDate,
    closedDate: row.closedDate,
    riskCategory: row.riskCategory,
    sourceId: row.internalCapaId,
    supplierId: row.supplierId,
    siteId: row.siteId,
    isOpen: isOpenStatus(row.status) && !row.closedDate,
  }));

  const externalNormalized = external.map((row) => ({
    source: "Hawkeye",
    severity: row.severity,
    status: row.status,
    dueDate: row.dueDate,
    openedDate: row.createdDate,
    closedDate: row.closedDate,
    riskCategory: row.metadata?.riskCategory || "GENERAL",
    sourceId: row.externalCapaId,
    supplierId: row.supplierId,
    siteId: row.siteId,
    isOpen: isOpenStatus(row.status) && !row.closedDate,
  }));

  return {
    internal: internalNormalized,
    external: externalNormalized,
    combined: [...internalNormalized, ...externalNormalized],
  };
};
