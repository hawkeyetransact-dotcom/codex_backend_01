import { Document } from "../models/documentModel.js";
import { DocumentView } from "../models/documentViewModel.js";
import { SharePolicy } from "../models/sharePolicyModel.js";
import { AccessEvent } from "../models/accessEventModel.js";
import { canAccessPolicy, resolvePolicyStatus } from "../utils/documentDisclosure.js";

const SUPPLIER_ROLES = ["supplier", "supplierUser"];
const ADMIN_ROLES = ["admin", "superadmin", "tenant_admin"];
const VIEW_TYPES = ["AUDITOR", "BUYER"];

const toStringSafe = (value) => (value === undefined || value === null ? "" : String(value));

const sanitizeRecipients = (recipients = []) =>
  Array.isArray(recipients)
    ? recipients
        .filter((r) => r && r.type && r.value)
        .map((r) => ({ type: r.type, value: toStringSafe(r.value) }))
    : [];

const maskDocument = (doc) => {
  if (!doc) return doc;
  const { originalFileRef, ...rest } = doc;
  return rest;
};

const buildGeneratedRef = ({ documentId, viewType, version }) =>
  `mock://redacted/${documentId}/${viewType}/v${version}.pdf`;

const ensureSupplier = (req, res) => {
  if (!SUPPLIER_ROLES.includes(req.user?.role)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
};

export const createDocument = async (req, res) => {
  try {
    if (!ensureSupplier(req, res)) return;
    const {
      contextType,
      contextRef,
      originalFileRef,
      encryptionMode,
      processingConsent,
      fileName,
      encryptionMeta,
      fileHash,
      redactionSpec,
      redactedText,
      status,
    } = req.body || {};
    if (!contextType || !contextRef || !originalFileRef) {
      return res.status(400).json({ error: "contextType, contextRef, and originalFileRef are required" });
    }
    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant context missing" });
    }
    const resolvedFileName =
      fileName ||
      toStringSafe(originalFileRef)
        .split("/")
        .pop() ||
      "document";

    const document = await Document.create({
      tenantId: req.tenantId,
      uploaderUserId: req.user?._id,
      contextType: toStringSafe(contextType),
      contextRef: toStringSafe(contextRef),
      originalFileRef: toStringSafe(originalFileRef),
      fileName: resolvedFileName,
      status: status === "REDACTION_ACCEPTED" ? "REDACTION_ACCEPTED" : "DRAFT",
      encryptionMode: encryptionMode || "STANDARD",
      encryptionMeta: encryptionMeta || {},
      fileHash: toStringSafe(fileHash),
      processingConsent: Boolean(processingConsent),
      redactionDraft: Array.isArray(redactionSpec) ? redactionSpec : [],
      redactedText: toStringSafe(redactedText),
    });

    return res.status(201).json({ success: true, data: document });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create document" });
  }
};

export const listDocuments = async (req, res) => {
  try {
    const { contextType, refId } = req.query;
    if (!contextType || !refId) {
      return res.status(400).json({ error: "contextType and refId are required" });
    }
    const query = {
      contextType: toStringSafe(contextType),
      contextRef: toStringSafe(refId),
    };

    if (SUPPLIER_ROLES.includes(req.user?.role)) {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context missing" });
      }
      query.tenantId = req.tenantId;
      const documents = await Document.find(query).sort({ createdAt: -1 }).lean();
      return res.json({ success: true, data: documents });
    }

    if (ADMIN_ROLES.includes(req.user?.role)) {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context missing" });
      }
      query.tenantId = req.tenantId;
      const documents = await Document.find(query).sort({ createdAt: -1 }).lean();
      return res.json({ success: true, data: documents.map(maskDocument) });
    }

    const documents = await Document.find(query).sort({ createdAt: -1 }).lean();
    if (!documents.length) {
      return res.json({ success: true, data: [] });
    }
    const docIds = documents.map((doc) => doc._id);
    const views = await DocumentView.find({ documentId: { $in: docIds } }).lean();
    const viewIds = views.map((view) => view._id);
    const policies = await SharePolicy.find({ documentViewId: { $in: viewIds } }).lean();
    const now = new Date();
    const allowedViewIds = new Set(
      policies.filter((policy) => canAccessPolicy(policy, req.user, now)).map((policy) => String(policy.documentViewId))
    );
    const allowedDocIds = new Set(
      views.filter((view) => allowedViewIds.has(String(view._id))).map((view) => String(view.documentId))
    );
    const allowedDocs = documents.filter((doc) => allowedDocIds.has(String(doc._id))).map(maskDocument);

    return res.json({ success: true, data: allowedDocs });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list documents" });
  }
};

export const saveRedactionDraft = async (req, res) => {
  try {
    if (!ensureSupplier(req, res)) return;
    const { id } = req.params;
    const { redactionSpec } = req.body || {};
    if (!Array.isArray(redactionSpec)) {
      return res.status(400).json({ error: "redactionSpec must be an array" });
    }
    const document = await Document.findOne({ _id: id, tenantId: req.tenantId });
    if (!document) return res.status(404).json({ error: "Document not found" });

    document.redactionDraft = redactionSpec;
    document.status = "DRAFT";
    await document.save();

    return res.json({ success: true, data: document });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to save redaction draft" });
  }
};

export const generateRedactionView = async (req, res) => {
  try {
    if (!ensureSupplier(req, res)) return;
    const { id } = req.params;
    const requestedViewType = toStringSafe(req.query.viewType).toUpperCase();
    const viewType = VIEW_TYPES.includes(requestedViewType) ? requestedViewType : "AUDITOR";
    const document = await Document.findOne({ _id: id, tenantId: req.tenantId });
    if (!document) return res.status(404).json({ error: "Document not found" });

    const latest = await DocumentView.findOne({ documentId: document._id, viewType }).sort({ version: -1 }).lean();
    const version = (latest?.version || 0) + 1;
    const redactionSpec = Array.isArray(req.body?.redactionSpec) ? req.body.redactionSpec : document.redactionDraft || [];

    const view = await DocumentView.create({
      documentId: document._id,
      viewType,
      version,
      redactionSpec,
      generatedFileRef: buildGeneratedRef({ documentId: document._id, viewType, version }),
      createdBy: req.user?._id,
    });

    document.status = "REDACTION_ACCEPTED";
    await document.save();

    return res.json({ success: true, data: view });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to generate redaction view" });
  }
};

export const listDocumentViews = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await Document.findById(id).lean();
    if (!document) return res.status(404).json({ error: "Document not found" });

    const views = await DocumentView.find({ documentId: id }).sort({ version: -1 }).lean();
    if (SUPPLIER_ROLES.includes(req.user?.role)) {
      if (req.tenantId && String(document.tenantId) !== String(req.tenantId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.json({ success: true, data: views });
    }
    if (ADMIN_ROLES.includes(req.user?.role)) {
      if (req.tenantId && String(document.tenantId) !== String(req.tenantId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.json({ success: true, data: views.map((view) => ({ ...view, generatedFileRef: "" })) });
    }

    const policies = await SharePolicy.find({ documentViewId: { $in: views.map((view) => view._id) } }).lean();
    const now = new Date();
    const allowedPolicyMap = new Map();
    policies.forEach((policy) => {
      if (canAccessPolicy(policy, req.user, now)) {
        allowedPolicyMap.set(String(policy.documentViewId), policy);
      }
    });
    const allowedViews = views.filter((view) => allowedPolicyMap.has(String(view._id)));

    if (allowedViews.length) {
      await AccessEvent.insertMany(
        allowedViews.map((view) => ({
          documentViewId: view._id,
          actorUserId: req.user?._id,
          actionType: "VIEW",
          ts: new Date(),
          metadata: { source: "listDocumentViews" },
        }))
      );
    }

    return res.json({ success: true, data: allowedViews });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list document views" });
  }
};

export const createSharePolicy = async (req, res) => {
  try {
    if (!ensureSupplier(req, res)) return;
    const { id } = req.params;
    const { recipients, startAt, endAt, controls = {} } = req.body || {};
    if (!startAt || !endAt) {
      return res.status(400).json({ error: "startAt and endAt are required" });
    }
    const view = await DocumentView.findById(id).lean();
    if (!view) return res.status(404).json({ error: "Document view not found" });

    const status = resolvePolicyStatus({ startAt, endAt });
    const policy = await SharePolicy.create({
      documentViewId: view._id,
      recipients: sanitizeRecipients(recipients),
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      controls: {
        allowDownload: Boolean(controls.allowDownload),
        watermark: Boolean(controls.watermark),
        otpRequired: Boolean(controls.otpRequired),
      },
      status,
    });

    await Document.updateOne(
      { _id: view.documentId, tenantId: req.tenantId },
      { $set: { status: status === "ACTIVE" ? "SHARED" : "REDACTION_ACCEPTED" } }
    );

    return res.status(201).json({ success: true, data: policy });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create share policy" });
  }
};

export const getAuditLog = async (req, res) => {
  try {
    const { id } = req.params;
    const view = await DocumentView.findById(id).lean();
    if (!view) return res.status(404).json({ error: "Document view not found" });

    const document = await Document.findById(view.documentId).lean();
    if (!document) return res.status(404).json({ error: "Document not found" });

    if (!SUPPLIER_ROLES.includes(req.user?.role)) {
      const policies = await SharePolicy.find({ documentViewId: view._id }).lean();
      const now = new Date();
      const allowed = policies.some((policy) => canAccessPolicy(policy, req.user, now));
      if (!allowed) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else if (req.tenantId && String(document.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const events = await AccessEvent.find({ documentViewId: view._id }).sort({ ts: -1 }).lean();
    return res.json({ success: true, data: events });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load audit log" });
  }
};
