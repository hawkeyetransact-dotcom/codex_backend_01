import mongoose from "mongoose";
import { InternalCAPAReference } from "../../models/InternalCAPAReference.js";
import { ExternalCAPA } from "../../models/ExternalCAPA.js";
import { ExternalAudit } from "../../models/ExternalAudit.js";
import { ComplianceEventCanonical } from "../../models/complianceEventCanonicalModel.js";

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeDocEntry = (doc = {}, defaults = {}) => {
  const name = String(doc.name || doc.fileName || doc.title || defaults.name || "").trim();
  if (!name) return null;
  const mimeType = String(doc.mimeType || doc.type || defaults.mimeType || "").trim();
  const fileExt = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return {
    name,
    url: doc.url || doc.path || "",
    mimeType,
    size: Number(doc.size || doc.sizeBytes || 0),
    fileExt,
    source: defaults.source || "unknown",
    sourceId: defaults.sourceId || "",
    eventType: defaults.eventType || "",
    metadata: doc.metadata || {},
  };
};

export const extractMetadata = (document = {}) => {
  const name = String(document.name || "").toLowerCase();
  const tags = [];
  if (/sop/.test(name)) tags.push("SOP");
  if (/deviation/.test(name)) tags.push("DEVIATION");
  if (/capa/.test(name)) tags.push("CAPA");
  if (/training/.test(name)) tags.push("TRAINING");
  if (/audit/.test(name)) tags.push("AUDIT");
  if (/inspection/.test(name)) tags.push("INSPECTION");
  if (/lab|test|coa/.test(name)) tags.push("LAB_RESULT");
  return {
    tags,
    documentType: tags[0] || "UNCLASSIFIED",
  };
};

export const collectEvidence = async ({
  tenantId,
  supplierId,
  siteId,
  connectionId,
  includeInternal = true,
  includeExternal = true,
} = {}) => {
  if (!tenantId) throw new Error("tenantId is required");

  const baseFilter = { tenantId: toObjectIdOrNull(tenantId) };
  if (supplierId) baseFilter.supplierId = toObjectIdOrNull(supplierId);
  if (siteId) baseFilter.siteId = toObjectIdOrNull(siteId);
  if (connectionId) baseFilter.connectionId = toObjectIdOrNull(connectionId);

  const evidence = [];

  if (includeInternal) {
    const [internalRefs, canonicalEvents] = await Promise.all([
      InternalCAPAReference.find(baseFilter).lean(),
      ComplianceEventCanonical.find(baseFilter).limit(500).lean(),
    ]);

    internalRefs.forEach((item) => {
      toArray(item.metadata?.supportingDocuments).forEach((doc) => {
        const normalized = normalizeDocEntry(doc, {
          source: "eQMS",
          sourceId: item.internalCapaId,
          eventType: "CAPA",
        });
        if (normalized) evidence.push(normalized);
      });
    });

    canonicalEvents.forEach((event) => {
      toArray(event.metadata?.documents).forEach((doc) => {
        const normalized = normalizeDocEntry(doc, {
          source: "eQMS",
          sourceId: String(event.eventId || event._id),
          eventType: event.eventType,
        });
        if (normalized) evidence.push(normalized);
      });
    });
  }

  if (includeExternal) {
    const externalCapas = await ExternalCAPA.find(baseFilter).lean();
    externalCapas.forEach((item) => {
      toArray(item.closureEvidence).forEach((doc) => {
        const normalized = normalizeDocEntry(doc, {
          source: "Hawkeye",
          sourceId: item.externalCapaId,
          eventType: "EXTERNAL_CAPA",
        });
        if (normalized) evidence.push(normalized);
      });
    });
  }

  return evidence.map((item) => ({
    ...item,
    extracted: extractMetadata(item),
  }));
};

export const linkEvidenceToAudit = async ({ tenantId, auditId, evidenceItems = [] } = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  if (!auditId) throw new Error("auditId is required");

  const links = evidenceItems.map((item, index) => ({
    linkId: `${auditId}-EVID-${index + 1}`,
    auditId: String(auditId),
    evidenceName: item.name,
    source: item.source,
    sourceId: item.sourceId,
    eventType: item.eventType,
    metadata: item.extracted || {},
  }));

  await ExternalAudit.findOneAndUpdate(
    { tenantId: toObjectIdOrNull(tenantId), auditId: String(auditId) },
    {
      $set: {
        tenantId: toObjectIdOrNull(tenantId),
        auditId: String(auditId),
        source: "Hawkeye",
      },
      $addToSet: {
        "metadata.evidenceLinks": { $each: links },
      },
    },
    { upsert: true, new: true }
  );

  return links;
};

export const indexEvidence = async ({ evidenceItems = [] } = {}) => {
  // This returns a deterministic metadata index for downstream RAG ingestion hooks.
  // Existing AskHawk ingest pipeline can be invoked by a follow-up worker using these records.
  return evidenceItems.map((item, index) => ({
    indexId: `eqms-evidence-${index + 1}`,
    title: item.name,
    source: item.source,
    sourceId: item.sourceId,
    eventType: item.eventType,
    mimeType: item.mimeType,
    tags: item.extracted?.tags || [],
    metadata: item.extracted || {},
  }));
};
