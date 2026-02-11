import { Readable } from "stream";
import csvParser from "csv-parser";
import { IntegrationProvider } from "../models/integrationProviderModel.js";
import { IntegrationConnection } from "../models/integrationConnectionModel.js";
import { IntegrationMappingConfig } from "../models/integrationMappingConfigModel.js";
import { IntegrationRunLog } from "../models/integrationRunLogModel.js";
import { ComplianceEventCanonical } from "../models/complianceEventCanonicalModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { Assessment } from "../models/assessmentModel.js";
import { DigiLockerDocument } from "../models/digilockerDocumentModel.js";
import { User } from "../models/userModel.js";
import { createConnection, updateConnection, setConnectionStatus } from "../integrations/services/connectionService.js";
import { upsertMapping, getMapping } from "../integrations/services/mappingService.js";
import { ingestEvents, runSync, ingestWebhook } from "../integrations/services/ingestionService.js";
import { listProviders, getProvider } from "../integrations/providers/index.js";
import { logIntegrationAudit } from "../integrations/services/auditLogService.js";
import { DigiLockerService } from "../services/digilocker/digilockerService.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const SUPPLIER_ROLES = new Set(["supplier", "supplierUser"]);
const BUYER_ROLES = new Set(["buyer"]);
const AUDITOR_ROLES = new Set(["auditor"]);
const SOLO_WORKSPACE_ROLES = new Set([
  "auditor",
  "supplier",
  "supplierUser",
  "buyer",
  "admin",
  "superadmin",
  "tenant_admin",
]);
const DOCUMENT_SOURCE_PROVIDER_KEYS = new Set([
  "email_inbox",
  "gmail_inbox",
  "outlook_inbox",
  "google_drive",
  "box_drive",
]);

const asString = (value) => (value ? String(value) : "");

const normalizeProviderEntry = (provider) => {
  const fallbackCaps = provider?.capabilities || {};
  return {
    providerKey: provider.providerKey,
    displayName: provider.displayName,
    category: provider.category || "Generic",
    capabilities: {
      supportsWebhook: Boolean(fallbackCaps.supportsWebhook ?? provider.supportsWebhook),
      supportsPolling: Boolean(fallbackCaps.supportsPolling ?? provider.supportsPolling),
      supportsSftp: Boolean(fallbackCaps.supportsSftp ?? provider.supportsSftp),
      supportsCsv: Boolean(fallbackCaps.supportsCsv ?? provider.supportsCsv),
      supportsApiAuth: Boolean(fallbackCaps.supportsApiAuth ?? true),
    },
    configSchema: provider.configSchema || {},
    mappingTemplates: provider.mappingTemplates || [],
    isEnabled: provider.isEnabled !== false,
  };
};

const assertTenant = (entityTenantId, req) => {
  if (entityTenantId && req.tenantId && asString(entityTenantId) !== asString(req.tenantId)) {
    const err = new Error("Not Found");
    err.status = 404;
    throw err;
  }
};

const ensureConnectionAccess = (connection, req) => {
  if (!connection) {
    const err = new Error("Connection not found");
    err.status = 404;
    throw err;
  }
  assertTenant(connection.tenantId, req);

  if (ADMIN_ROLES.has(req.user?.role)) return { role: req.user?.role, isAdmin: true };

  if (SUPPLIER_ROLES.has(req.user?.role)) {
    const ownerMatch = asString(connection.ownerUserId) === asString(req.user?._id);
    const supplierMatch = asString(connection.supplierId) === asString(req.user?._id);
    if (!ownerMatch && !supplierMatch) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return { role: req.user?.role, isSupplier: true };
  }

  if (AUDITOR_ROLES.has(req.user?.role)) {
    const ownerMatch = asString(connection.ownerUserId) === asString(req.user?._id);
    const supplierMatch = asString(connection.supplierId) === asString(req.user?._id);
    if (!ownerMatch && !supplierMatch) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return { role: req.user?.role, isAuditor: true };
  }

  if (BUYER_ROLES.has(req.user?.role)) {
    const ownerMatch = asString(connection.ownerUserId) === asString(req.user?._id);
    const allowed = connection.visibilityPolicy?.shareWithBuyerIds?.some(
      (id) => asString(id) === asString(req.user?._id)
    );
    if (!ownerMatch && !allowed) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return { role: req.user?.role, isBuyer: true };
  }

  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
};

const parseCsvBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csvParser())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

export const listIntegrationProviders = async (_req, res) => {
  try {
    const dbProviders = await IntegrationProvider.find({ isEnabled: true }).sort({ displayName: 1 }).lean();
    const registryProviders = listProviders().map((provider) => normalizeProviderEntry(provider));
    const merged = new Map();
    dbProviders.forEach((provider) => merged.set(provider.providerKey, normalizeProviderEntry(provider)));
    registryProviders.forEach((provider) => {
      if (!merged.has(provider.providerKey)) merged.set(provider.providerKey, provider);
    });
    return res.json({
      success: true,
      data: Array.from(merged.values()).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))),
    });
  } catch (err) {
    console.error("listIntegrationProviders", err);
    return res.status(500).json({ error: "Failed to load providers" });
  }
};

export const listBuyers = async (req, res) => {
  try {
    const buyers = await User.find({ tenant_id: req.tenantId, role: "buyer", status: "ACTIVE" })
      .select("_id email name")
      .lean();
    return res.json({ success: true, data: buyers });
  } catch (err) {
    console.error("listBuyers", err);
    return res.status(500).json({ error: "Failed to load buyers" });
  }
};

export const createIntegrationConnection = async (req, res) => {
  try {
    const role = req.user?.role;
    const isSupplier = SUPPLIER_ROLES.has(role);
    const isAuditor = AUDITOR_ROLES.has(role);
    const isBuyer = BUYER_ROLES.has(role);
    const isAdmin = ADMIN_ROLES.has(role);

    let supplierId = req.body?.supplierId || null;
    let ownerUserId = req.body?.ownerUserId || req.user?._id;
    let ownerRole = role || "supplier";
    let workspaceMode = req.body?.workspaceMode || "TEAM";

    if (isSupplier) {
      supplierId = req.user?._id;
      ownerUserId = req.user?._id;
      ownerRole = role;
      workspaceMode = workspaceMode === "SOLO" ? "SOLO" : "TEAM";
    }

    if (isAuditor) {
      supplierId = supplierId || req.user?._id;
      ownerUserId = req.user?._id;
      ownerRole = "auditor";
      workspaceMode = "SOLO";
    }

    if (isBuyer) {
      supplierId = supplierId || req.user?._id;
      ownerUserId = req.user?._id;
      ownerRole = "buyer";
      workspaceMode = workspaceMode === "SOLO" ? "SOLO" : "TEAM";
    }

    if (isAdmin) {
      ownerUserId = ownerUserId || supplierId || req.user?._id;
      ownerRole = req.body?.ownerRole || (supplierId ? "supplier" : role || "admin");
      workspaceMode = req.body?.workspaceMode || workspaceMode;
    }

    if (!supplierId && !isAuditor) {
      return res.status(400).json({ error: "supplierId is required" });
    }

    const connection = await createConnection({
      tenantId: req.tenantId,
      supplierId,
      ownerUserId,
      ownerRole,
      workspaceMode,
      body: req.body,
      userId: req.user?._id,
    });
    await logIntegrationAudit({
      req,
      action: "CREATE_CONNECTION",
      entityType: "IntegrationConnection",
      entityId: connection._id,
      after: connection.toObject(),
    });
    return res.json({ success: true, data: connection });
  } catch (err) {
    console.error("createIntegrationConnection", err);
    return res.status(500).json({ error: err.message || "Failed to create connection" });
  }
};

export const listIntegrationConnections = async (req, res) => {
  try {
    const query = {};
    if (req.tenantId) query.tenantId = req.tenantId;
    if (SUPPLIER_ROLES.has(req.user?.role)) {
      query.$or = [{ supplierId: req.user?._id }, { ownerUserId: req.user?._id }];
    }
    if (AUDITOR_ROLES.has(req.user?.role)) {
      query.$or = [{ ownerUserId: req.user?._id }, { supplierId: req.user?._id }];
    }
    if (BUYER_ROLES.has(req.user?.role)) {
      query.$or = [{ ownerUserId: req.user?._id }, { "visibilityPolicy.shareWithBuyerIds": req.user?._id }];
    }
    const connections = await IntegrationConnection.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: connections });
  } catch (err) {
    console.error("listIntegrationConnections", err);
    return res.status(500).json({ error: "Failed to load connections" });
  }
};

export const getIntegrationConnection = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id).lean();
    ensureConnectionAccess(connection, req);
    return res.json({ success: true, data: connection });
  } catch (err) {
    console.error("getIntegrationConnection", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load connection" });
  }
};

export const updateIntegrationConnection = async (req, res) => {
  try {
    const existing = await IntegrationConnection.findById(req.params.id).lean();
    ensureConnectionAccess(existing, req);
    const connection = await updateConnection({
      connectionId: req.params.id,
      body: req.body,
      userId: req.user?._id,
    });
    await logIntegrationAudit({
      req,
      action: "UPDATE_CONNECTION",
      entityType: "IntegrationConnection",
      entityId: connection._id,
      before: existing,
      after: connection.toObject(),
    });
    return res.json({ success: true, data: connection });
  } catch (err) {
    console.error("updateIntegrationConnection", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to update connection" });
  }
};

export const testIntegrationConnection = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const provider = getProvider(connection.providerKey);
    if (!provider) return res.status(400).json({ error: "Provider not found" });
    const result = await provider.testConnection(connection);
    await logIntegrationAudit({
      req,
      action: "TEST_CONNECTION",
      entityType: "IntegrationConnection",
      entityId: connection._id,
      after: { result },
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("testIntegrationConnection", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to test connection" });
  }
};

export const upsertIntegrationMapping = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const eventType = req.body?.eventType || req.query?.eventType;
    if (!eventType) return res.status(400).json({ error: "eventType is required" });
    const mapping = await upsertMapping({
      tenantId: connection.tenantId,
      connectionId: connection._id,
      eventType,
      body: req.body,
    });
    await IntegrationConnection.findByIdAndUpdate(connection._id, { $set: { mappingConfigId: mapping._id } });
    await logIntegrationAudit({
      req,
      action: "UPDATE_MAPPING",
      entityType: "IntegrationMappingConfig",
      entityId: mapping._id,
      after: mapping.toObject(),
    });
    return res.json({ success: true, data: mapping });
  } catch (err) {
    console.error("upsertIntegrationMapping", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to save mapping" });
  }
};

export const getIntegrationMapping = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const eventType = req.query?.eventType;
    const mapping = await getMapping({ tenantId: connection.tenantId, connectionId: connection._id, eventType });
    return res.json({ success: true, data: mapping });
  } catch (err) {
    console.error("getIntegrationMapping", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load mapping" });
  }
};

export const activateIntegrationConnection = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const feeds = connection.selectedFeeds?.filter((feed) => feed.enabled) || [];
    if (feeds.length === 0) return res.status(400).json({ error: "Select at least one feed" });

    const mappings = await IntegrationMappingConfig.find({
      tenantId: connection.tenantId,
      connectionId: connection._id,
      eventType: { $in: feeds.map((feed) => feed.eventType) },
    }).lean();

    const approved = new Set(mappings.filter((m) => m.approvedBySupplier).map((m) => m.eventType));
    const missing = feeds.filter((feed) => !approved.has(feed.eventType));
    if (missing.length > 0 && !connection.demoMode) {
      return res.status(400).json({ error: "Mappings must be approved before activation." });
    }

    const now = new Date();
    const schedule = connection.schedule || {};
    const frequencyMs = (schedule.frequencyMins || 240) * 60000;
    schedule.nextRunAt = new Date(now.getTime() + frequencyMs);

    const updated = await setConnectionStatus({
      connectionId: connection._id,
      status: "Active",
      userId: req.user?._id,
      schedule,
    });

    await logIntegrationAudit({
      req,
      action: "ACTIVATE",
      entityType: "IntegrationConnection",
      entityId: updated._id,
      before: connection.toObject(),
      after: updated.toObject(),
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("activateIntegrationConnection", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to activate" });
  }
};

export const pauseIntegrationConnection = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const updated = await setConnectionStatus({
      connectionId: connection._id,
      status: "Paused",
      userId: req.user?._id,
    });
    await logIntegrationAudit({
      req,
      action: "PAUSE",
      entityType: "IntegrationConnection",
      entityId: updated._id,
      before: connection.toObject(),
      after: updated.toObject(),
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("pauseIntegrationConnection", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to pause" });
  }
};

export const runIntegrationNow = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const result = await runSync({ connectionId: connection._id, runType: "MANUAL" });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("runIntegrationNow", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to run sync" });
  }
};

export const ingestIntegrationWebhook = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.connectionId);
    if (!connection) return res.status(404).json({ error: "Connection not found" });
    if (connection.status !== "Active") {
      return res.status(400).json({ error: "Connection not active" });
    }
    const result = await ingestWebhook({
      connection,
      payload: req.body,
      headers: req.headers,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("ingestIntegrationWebhook", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to ingest webhook" });
  }
};

export const generateDemoEvents = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    if (!connection.demoMode) return res.status(400).json({ error: "Demo mode not enabled" });
    const provider = getProvider("demo_simulator");
    const { eventType, count, scenario } = req.body || {};
    const events = provider.generateEvents({
      connectionId: connection._id,
      eventType: eventType || "CAPA",
      count: count || 5,
      scenario: scenario || "normal_week",
    });
    const result = await ingestEvents({
      connection,
      provider,
      events,
      runType: "MANUAL",
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("generateDemoEvents", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to generate demo events" });
  }
};

export const listIntegrationRuns = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const runs = await IntegrationRunLog.find({ connectionId: connection._id })
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();
    return res.json({ success: true, data: runs });
  } catch (err) {
    console.error("listIntegrationRuns", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load runs" });
  }
};

export const listIntegrationEvents = async (req, res) => {
  try {
    const query = {};
    if (req.tenantId) query.tenantId = req.tenantId;
    if (req.query?.supplierId) query.supplierId = req.query.supplierId;
    if (req.query?.connectionId) query.connectionId = req.query.connectionId;
    if (req.query?.eventType) query.eventType = req.query.eventType;
    if (req.query?.status) query.status = req.query.status;
    if (req.query?.dateFrom || req.query?.dateTo) {
      query.openedDate = {};
      if (req.query?.dateFrom) query.openedDate.$gte = new Date(req.query.dateFrom);
      if (req.query?.dateTo) query.openedDate.$lte = new Date(req.query.dateTo);
    }

    if (SUPPLIER_ROLES.has(req.user?.role)) {
      const connections = await IntegrationConnection.find({
        tenantId: req.tenantId,
        $or: [{ supplierId: req.user?._id }, { ownerUserId: req.user?._id }],
      }).select("_id");
      const allowedIds = connections.map((conn) => asString(conn._id));
      if (req.query?.connectionId) {
        if (!allowedIds.includes(asString(req.query.connectionId))) {
          return res.status(403).json({ error: "Forbidden" });
        }
        query.connectionId = req.query.connectionId;
      } else {
        query.connectionId = { $in: connections.map((conn) => conn._id) };
      }
    }

    if (BUYER_ROLES.has(req.user?.role)) {
      const connections = await IntegrationConnection.find({
        tenantId: req.tenantId,
        $or: [{ ownerUserId: req.user?._id }, { "visibilityPolicy.shareWithBuyerIds": req.user?._id }],
      }).select("_id");
      const allowedIds = connections.map((conn) => asString(conn._id));
      if (req.query?.connectionId) {
        if (!allowedIds.includes(asString(req.query.connectionId))) {
          return res.status(403).json({ error: "Forbidden" });
        }
        query.connectionId = req.query.connectionId;
      } else {
        query.connectionId = { $in: connections.map((conn) => conn._id) };
      }
    }

    if (AUDITOR_ROLES.has(req.user?.role)) {
      const connections = await IntegrationConnection.find({
        tenantId: req.tenantId,
        $or: [{ ownerUserId: req.user?._id }, { supplierId: req.user?._id }],
      }).select("_id");
      const allowedIds = connections.map((conn) => asString(conn._id));
      if (req.query?.connectionId) {
        if (!allowedIds.includes(asString(req.query.connectionId))) {
          return res.status(403).json({ error: "Forbidden" });
        }
        query.connectionId = req.query.connectionId;
      } else {
        query.connectionId = { $in: connections.map((conn) => conn._id) };
      }
    }

    const limit = Number(req.query?.limit || 50);
    const page = Number(req.query?.page || 1);
    const skip = (page - 1) * limit;
    const events = await ComplianceEventCanonical.find(query)
      .sort({ openedDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error("listIntegrationEvents", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load events" });
  }
};

export const uploadCsvEvents = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    const provider = getProvider("csv_upload");
    const eventType = req.body?.eventType || "CAPA";
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });
    const rows = await parseCsvBuffer(req.file.buffer);
    const events = rows.map((row, idx) => ({
      eventType,
      sourceEventId: row.eventId || row.id || `${eventType}-${idx + 1}`,
      payload: row,
    }));
    const result = await ingestEvents({ connection, provider, events, runType: "MANUAL" });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("uploadCsvEvents", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to upload CSV" });
  }
};

export const importIntegrationDocuments = async (req, res) => {
  try {
    const connection = await IntegrationConnection.findById(req.params.id);
    ensureConnectionAccess(connection, req);
    if (!DOCUMENT_SOURCE_PROVIDER_KEYS.has(connection.providerKey)) {
      return res.status(400).json({
        error: "Document import is supported for inbox and drive connectors only",
      });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: "At least one file is required" });
    }

    const tenantId = req.tenantId || connection.tenantId;
    const supplierOrgId = connection.supplierId || connection.ownerUserId || req.user?._id;
    const actorUserId = req.user?._id;
    const now = new Date();
    const imported = [];
    let errors = 0;

    for (const file of files) {
      try {
        const title = req.body?.title || file.originalname;
        const tags = Array.isArray(req.body?.tags)
          ? req.body.tags
          : String(req.body?.tags || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
        const document = await DigiLockerService.createDocument({
          tenantId,
          supplierOrgId,
          ownerUserId: actorUserId,
          payload: {
            title,
            description: req.body?.description || `Imported from ${connection.displayName || connection.providerKey}`,
            tags: Array.from(new Set([...tags, "integration-import", connection.providerKey])),
            docType: req.body?.docType || "Record",
            department: req.body?.department || "QA",
            confidentiality: req.body?.confidentiality || "Internal",
          },
        });

        const uploadResult = await DigiLockerService.uploadVersion({
          documentId: document._id,
          tenantId,
          supplierOrgId,
          file,
          meta: {
            versionLabel: req.body?.versionLabel,
          },
          actorUserId,
        });

        const version = uploadResult?.version;
        const eventId = `DOC-${String(version?._id || document._id)}`;
        await ComplianceEventCanonical.findOneAndUpdate(
          {
            tenantId,
            connectionId: connection._id,
            eventType: "DOCUMENT_IMPORT",
            eventId,
          },
          {
            $set: {
              tenantId,
              connectionId: connection._id,
              supplierId: supplierOrgId,
              providerKey: connection.providerKey,
              eventType: "DOCUMENT_IMPORT",
              eventId,
              status: "Open",
              severity: "Info",
              openedDate: now,
              ownerRole: req.user?.role,
              metadata: {
                source: "integration_document_import",
                sourceProvider: connection.providerKey,
                fileName: file.originalname,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                documentId: document._id,
                versionId: version?._id,
                documentTitle: document.title,
              },
            },
          },
          { upsert: true, new: true }
        );

        imported.push({
          fileName: file.originalname,
          documentId: document._id,
          versionId: version?._id,
        });
      } catch (error) {
        errors += 1;
        console.error("importIntegrationDocuments item failed", error?.message || error);
      }
    }

    const runLog = await IntegrationRunLog.create({
      tenantId,
      connectionId: connection._id,
      runType: "MANUAL",
      startedAt: now,
      endedAt: new Date(),
      status: errors > 0 ? "Partial" : "Success",
      stats: {
        fetched: files.length,
        ingestedRaw: imported.length,
        normalized: imported.length,
        deduped: 0,
        errors,
      },
      errorSummary: errors > 0 ? `${errors} file(s) failed to import` : "",
    });

    const schedule = connection.schedule || {};
    schedule.lastRunAt = new Date();
    schedule.nextRunAt = null;
    await IntegrationConnection.findByIdAndUpdate(connection._id, { $set: { schedule, updatedBy: actorUserId } });

    await logIntegrationAudit({
      req,
      action: "IMPORT_DOCUMENTS",
      entityType: "IntegrationConnection",
      entityId: connection._id,
      after: { importedCount: imported.length, errorCount: errors, runLogId: runLog._id },
    });

    return res.json({
      success: true,
      data: {
        importedCount: imported.length,
        errorCount: errors,
        items: imported,
        runLogId: runLog._id,
      },
    });
  } catch (err) {
    console.error("importIntegrationDocuments", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to import documents" });
  }
};

export const getSoloWorkspace = async (req, res) => {
  try {
    if (!SOLO_WORKSPACE_ROLES.has(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const targetUserId =
      ADMIN_ROLES.has(req.user?.role) && req.query?.userId ? req.query.userId : req.user?._id;
    if (!targetUserId) return res.status(400).json({ error: "userId is required" });

    const tenantId = req.tenantId;
    const tenantOrgId = tenantId ? String(tenantId) : undefined;
    const role = req.user?.role;
    const canViewSupplierAssignments = SUPPLIER_ROLES.has(role) || ADMIN_ROLES.has(role);
    const canViewBuyerAssignments = BUYER_ROLES.has(role) || ADMIN_ROLES.has(role);
    const canViewAuditorAssignments = AUDITOR_ROLES.has(role) || ADMIN_ROLES.has(role);

    const auditAssignmentOr = [];
    if (canViewAuditorAssignments) auditAssignmentOr.push({ auditor_id: targetUserId });
    if (canViewSupplierAssignments) auditAssignmentOr.push({ supplier_id: targetUserId });
    if (canViewBuyerAssignments) auditAssignmentOr.push({ create_by_buyer_id: targetUserId });

    const assessmentAssignmentOr = [];
    if (canViewAuditorAssignments) assessmentAssignmentOr.push({ "assignedAuditors.userId": targetUserId });
    if (canViewSupplierAssignments) assessmentAssignmentOr.push({ "scope.supplierId": targetUserId });
    if (canViewBuyerAssignments) assessmentAssignmentOr.push({ "scope.buyerId": targetUserId });

    const [connections, recentDocuments, auditAssignments, assessmentAssignments] =
      await Promise.all([
        IntegrationConnection.find({
          ...(tenantId ? { tenantId } : {}),
          $or: [{ ownerUserId: targetUserId }, { supplierId: targetUserId }],
        })
          .sort({ updatedAt: -1 })
          .lean(),
        DigiLockerDocument.find({
          ...(tenantId ? { tenantId } : {}),
          ...(canViewSupplierAssignments
            ? { $or: [{ ownerUserId: targetUserId }, { supplierOrgId: targetUserId }] }
            : { ownerUserId: targetUserId }),
        })
          .sort({ updatedAt: -1 })
          .limit(25)
          .lean(),
        AuditRequestMaster.find({
          ...(tenantOrgId ? { tenantOrgId } : {}),
          ...(auditAssignmentOr.length ? { $or: auditAssignmentOr } : { _id: null }),
          isArchived: { $ne: true },
        })
          .sort({ updatedAt: -1 })
          .limit(25)
          .select("_id hawkeyeRequestId internalRequestId trackStatus complianceDate updatedAt questionnaireStatus phaseState")
          .lean(),
        Assessment.find({
          ...(tenantId ? { tenantId } : {}),
          ...(assessmentAssignmentOr.length ? { $or: assessmentAssignmentOr } : { _id: null }),
        })
          .sort({ updatedAt: -1 })
          .limit(25)
          .select("_id assessmentCode currentPhaseKey status updatedAt modules")
          .lean(),
      ]);

    const connectionIds = connections.map((connection) => connection._id);
    const recentEvents = connectionIds.length
      ? await ComplianceEventCanonical.find({
          ...(tenantId ? { tenantId } : {}),
          connectionId: { $in: connectionIds },
        })
          .sort({ openedDate: -1, createdAt: -1 })
          .limit(50)
          .lean()
      : [];

    const summary = {
      integrationsConnected: connections.length,
      recentDocuments: recentDocuments.length,
      openWorkAssignments:
        auditAssignments.filter((audit) => String(audit?.trackStatus || "").toLowerCase() !== "closed").length +
        assessmentAssignments.filter((assessment) => String(assessment?.status || "").toUpperCase() !== "COMPLETED").length,
      pendingEvents: recentEvents.filter((event) => String(event.status || "").toLowerCase() !== "closed").length,
    };

    return res.json({
      success: true,
      data: {
        summary,
        integrations: connections,
        documents: recentDocuments,
        auditAssignments,
        assessmentAssignments,
        recentEvents,
      },
    });
  } catch (err) {
    console.error("getSoloWorkspace", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load solo workspace" });
  }
};

export const getIntegrationMetrics = async (req, res) => {
  try {
    const supplierId =
      req.query?.supplierId ||
      (SUPPLIER_ROLES.has(req.user?.role) || AUDITOR_ROLES.has(req.user?.role) || BUYER_ROLES.has(req.user?.role)
        ? req.user?._id
        : null);
    if (!supplierId) return res.status(400).json({ error: "supplierId is required" });

    const now = new Date();
    const last90 = new Date(now.getTime() - 90 * 86400000);
    const last30 = new Date(now.getTime() - 30 * 86400000);

    const openCapaCount = await ComplianceEventCanonical.countDocuments({
      tenantId: req.tenantId,
      supplierId,
      eventType: "CAPA",
      $or: [{ closedDate: { $exists: false } }, { closedDate: null }],
    });
    const overdueCapaCount = await ComplianceEventCanonical.countDocuments({
      tenantId: req.tenantId,
      supplierId,
      eventType: "CAPA",
      $or: [{ closedDate: { $exists: false } }, { closedDate: null }],
      dueDate: { $lt: now },
    });
    const avgCapaClosure = await ComplianceEventCanonical.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          supplierId,
          eventType: "CAPA",
          closedDate: { $gte: last90 },
          actualDays: { $exists: true },
        },
      },
      { $group: { _id: null, avgDays: { $avg: "$actualDays" } } },
    ]);
    const deviationCount30d = await ComplianceEventCanonical.countDocuments({
      tenantId: req.tenantId,
      supplierId,
      eventType: "DEVIATION",
      openedDate: { $gte: last30 },
    });
    const repeatObservationRate = await ComplianceEventCanonical.aggregate([
      {
        $match: { tenantId: req.tenantId, supplierId, repeatEvent: { $exists: true } },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          repeats: { $sum: { $cond: ["$repeatEvent", 1, 0] } },
        },
      },
    ]);

    const total = repeatObservationRate[0]?.total || 0;
    const repeats = repeatObservationRate[0]?.repeats || 0;
    const responsivenessScore = Math.max(0, 100 - overdueCapaCount * 2 - deviationCount30d);

    return res.json({
      success: true,
      data: {
        openCapaCount,
        overdueCapaCount,
        avgCapaClosureDays: avgCapaClosure[0]?.avgDays || 0,
        deviationCount30d,
        repeatObservationRate: total ? repeats / total : 0,
        responsivenessScore,
      },
    });
  } catch (err) {
    console.error("getIntegrationMetrics", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to load metrics" });
  }
};
