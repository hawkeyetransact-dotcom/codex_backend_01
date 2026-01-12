import crypto from "crypto";
import { IntegrationConnection } from "../../models/integrationConnectionModel.js";
import { IntegrationMappingConfig } from "../../models/integrationMappingConfigModel.js";
import { ComplianceEventRaw } from "../../models/complianceEventRawModel.js";
import { ComplianceEventCanonical } from "../../models/complianceEventCanonicalModel.js";
import { IntegrationRunLog } from "../../models/integrationRunLogModel.js";
import { getProvider } from "../providers/index.js";
import { normalizeWithMapping } from "../providers/utils.js";
import { decryptSecret } from "./crypto.js";

const hashPayload = (payload) =>
  crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");

const toDate = (value) => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const computeActualDays = (openedDate, closedDate) => {
  if (!openedDate || !closedDate) return undefined;
  const diff = closedDate.getTime() - openedDate.getTime();
  return diff > 0 ? Math.ceil(diff / 86400000) : 0;
};

const buildCanonicalDoc = ({ canonical, payload, rawEvent, connection }) => {
  const openedDate = toDate(canonical.openedDate);
  const dueDate = toDate(canonical.dueDate);
  const closedDate = toDate(canonical.closedDate);
  const actualDays = computeActualDays(openedDate, closedDate);
  const slaDays = canonical.slaDays ?? (openedDate && dueDate ? computeActualDays(openedDate, dueDate) : undefined);

  return {
    tenantId: connection.tenantId,
    connectionId: connection._id,
    supplierId: connection.supplierId,
    providerKey: connection.providerKey,
    eventType: rawEvent.eventType,
    eventId: canonical.eventId || rawEvent.sourceEventId,
    status: canonical.status,
    severity: canonical.severity,
    openedDate,
    dueDate,
    closedDate,
    slaDays,
    actualDays,
    repeatEvent: canonical.repeatEvent || false,
    siteId: canonical.siteId,
    productId: canonical.productId,
    ownerRole: canonical.ownerRole,
    linkedAuditId: canonical.linkedAuditId,
    metadata: canonical.metadata || { source: payload },
  };
};

const resolveMapping = async (connection, eventType) => {
  if (!eventType) return null;
  return IntegrationMappingConfig.findOne({
    tenantId: connection.tenantId,
    connectionId: connection._id,
    eventType,
  }).lean();
};

const normalizeEvent = async (rawEvent, connection, provider) => {
  const mappingConfig = await resolveMapping(connection, rawEvent.eventType);
  if (provider?.normalize) {
    return provider.normalize(rawEvent, mappingConfig);
  }
  return normalizeWithMapping(rawEvent, mappingConfig);
};

const ingestSingle = async ({ rawEvent, connection, provider, runId }) => {
  const payload = rawEvent.payload || {};
  const checksum = hashPayload(payload);
  const orConditions = [{ checksum }];
  if (rawEvent.sourceEventId) {
    orConditions.unshift({ sourceEventId: rawEvent.sourceEventId });
  }
  const existing = await ComplianceEventRaw.findOne({
    connectionId: connection._id,
    eventType: rawEvent.eventType,
    $or: orConditions,
  }).lean();

  if (existing) {
    return { deduped: true };
  }

  let rawDoc;
  try {
    rawDoc = await ComplianceEventRaw.create({
      tenantId: connection.tenantId,
      connectionId: connection._id,
      providerKey: connection.providerKey,
      eventType: rawEvent.eventType,
      sourceEventId: rawEvent.sourceEventId,
      payload,
      checksum,
      ingestionRunId: runId,
    });
  } catch (err) {
    if (err.code === 11000) return { deduped: true };
    throw err;
  }

  const normalized = await normalizeEvent(rawEvent, connection, provider);
  const canonicalDoc = buildCanonicalDoc({ canonical: normalized.canonical || {}, payload, rawEvent, connection });
  if (!canonicalDoc.eventId) {
    canonicalDoc.eventId = rawDoc._id.toString();
  }

  await ComplianceEventCanonical.findOneAndUpdate(
    {
      tenantId: connection.tenantId,
      connectionId: connection._id,
      eventType: rawEvent.eventType,
      eventId: canonicalDoc.eventId,
    },
    { $set: canonicalDoc },
    { upsert: true, new: true }
  );

  return { deduped: false };
};

export const ingestEvents = async ({ connection, provider, events, runType }) => {
  const runLog = await IntegrationRunLog.create({
    tenantId: connection.tenantId,
    connectionId: connection._id,
    runType,
    startedAt: new Date(),
    status: "Success",
  });

  const stats = {
    fetched: events.length,
    ingestedRaw: 0,
    normalized: 0,
    deduped: 0,
    errors: 0,
  };

  for (const rawEvent of events) {
    try {
      const eventType = rawEvent.eventType || connection.selectedFeeds?.[0]?.eventType || "CAPA";
      const enrichedEvent = { ...rawEvent, eventType };
      const result = await ingestSingle({ rawEvent: enrichedEvent, connection, provider, runId: runLog._id.toString() });
      if (result.deduped) {
        stats.deduped += 1;
      } else {
        stats.ingestedRaw += 1;
        stats.normalized += 1;
      }
    } catch (err) {
      stats.errors += 1;
      console.error("[integration] ingest error", err.message);
    }
  }

  runLog.stats = stats;
  runLog.endedAt = new Date();
  runLog.status = stats.errors > 0 ? "Partial" : "Success";
  await runLog.save();

  return { runLog, stats };
};

export const runSync = async ({ connectionId, runType = "MANUAL" }) => {
  const connection = await IntegrationConnection.findById(connectionId);
  if (!connection) throw new Error("Connection not found");
  const provider = getProvider(connection.providerKey);
  if (!provider) throw new Error("Provider not found");

  const cursor = connection.schedule?.cursor || null;
  const result = await provider.fetchDelta(connection, cursor);
  const events = result?.events || [];
  const nextCursor = result?.nextCursor || cursor;

  const { runLog, stats } = await ingestEvents({ connection, provider, events, runType });

  const schedule = connection.schedule || {};
  const now = new Date();
  const frequencyMs = (schedule.frequencyMins || 240) * 60000;

  schedule.lastRunAt = now;
  schedule.nextRunAt = new Date(now.getTime() + frequencyMs);
  schedule.cursor = nextCursor;

  connection.schedule = schedule;
  connection.health = connection.health || {};
  if (stats.errors > 0) {
    connection.health.lastErrorAt = now;
    connection.health.lastErrorMessage = runLog.errorSummary || "Errors during sync";
    connection.health.consecutiveFailures = (connection.health.consecutiveFailures || 0) + 1;
  } else {
    connection.health.lastSuccessAt = now;
    connection.health.consecutiveFailures = 0;
  }
  await connection.save();
  return { connection, runLog, stats };
};

export const ingestWebhook = async ({ connection, payload, headers }) => {
  if (!connection) throw new Error("Connection not found");
  const provider = getProvider(connection.providerKey);
  if (!provider) throw new Error("Provider not found");

  if (connection.auth?.credentialsRef) {
    const creds = decryptSecret(connection.auth.credentialsRef);
    const secret = creds?.webhookSecret || creds?.apiKey;
    const signature =
      headers?.["x-hawkeye-signature"] || headers?.["x-hawkeye-token"] || headers?.["x-api-key"];
    if (secret && signature && signature !== secret) {
      const err = new Error("Invalid signature");
      err.status = 401;
      throw err;
    }
  }

  const eventType = payload?.eventType || payload?.type || "CAPA";
  const rawEvent = {
    eventType,
    sourceEventId: payload?.eventId || payload?.id,
    payload,
  };

  return ingestEvents({ connection, provider, events: [rawEvent], runType: "WEBHOOK" });
};
