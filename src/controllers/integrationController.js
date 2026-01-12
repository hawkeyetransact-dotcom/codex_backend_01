import { Readable } from "stream";
import csvParser from "csv-parser";
import { IntegrationProvider } from "../models/integrationProviderModel.js";
import { IntegrationConnection } from "../models/integrationConnectionModel.js";
import { IntegrationMappingConfig } from "../models/integrationMappingConfigModel.js";
import { IntegrationRunLog } from "../models/integrationRunLogModel.js";
import { ComplianceEventCanonical } from "../models/complianceEventCanonicalModel.js";
import { User } from "../models/userModel.js";
import { createConnection, updateConnection, setConnectionStatus } from "../integrations/services/connectionService.js";
import { upsertMapping, getMapping } from "../integrations/services/mappingService.js";
import { ingestEvents, runSync, ingestWebhook } from "../integrations/services/ingestionService.js";
import { listProviders, getProvider } from "../integrations/providers/index.js";
import { logIntegrationAudit } from "../integrations/services/auditLogService.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
const SUPPLIER_ROLES = new Set(["supplier", "supplierUser"]);
const BUYER_ROLES = new Set(["buyer"]);

const asString = (value) => (value ? String(value) : "");

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
    if (asString(connection.supplierId) !== asString(req.user?._id)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return { role: req.user?.role, isSupplier: true };
  }

  if (BUYER_ROLES.has(req.user?.role)) {
    const allowed = connection.visibilityPolicy?.shareWithBuyerIds?.some(
      (id) => asString(id) === asString(req.user?._id)
    );
    if (!allowed) {
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
    const providers = await IntegrationProvider.find({ isEnabled: true }).sort({ displayName: 1 }).lean();
    if (providers.length === 0) {
      return res.json({ success: true, data: listProviders() });
    }
    return res.json({ success: true, data: providers });
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
    const supplierId = SUPPLIER_ROLES.has(req.user?.role) ? req.user?._id : req.body?.supplierId;
    if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
    const connection = await createConnection({
      tenantId: req.tenantId,
      supplierId,
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
      query.supplierId = req.user?._id;
    }
    if (BUYER_ROLES.has(req.user?.role)) {
      query["visibilityPolicy.shareWithBuyerIds"] = req.user?._id;
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

    if (BUYER_ROLES.has(req.user?.role)) {
      const connections = await IntegrationConnection.find({
        tenantId: req.tenantId,
        "visibilityPolicy.shareWithBuyerIds": req.user?._id,
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

export const getIntegrationMetrics = async (req, res) => {
  try {
    const supplierId = req.query?.supplierId || (SUPPLIER_ROLES.has(req.user?.role) ? req.user?._id : null);
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
