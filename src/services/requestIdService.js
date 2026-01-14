import crypto from "crypto";
import mongoose from "mongoose";
import Tenant from "../models/tenantModel.js";
import { RequestIdCounter } from "../models/requestIdCounterModel.js";
import { AuditRequestAlias } from "../models/auditRequestAliasModel.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const encodeTime = (timeMs) => {
  let time = Number(timeMs) || Date.now();
  let output = "";
  for (let i = 0; i < 10; i += 1) {
    const mod = time % 32;
    output = CROCKFORD[mod] + output;
    time = Math.floor(time / 32);
  }
  return output;
};

const randomChars = (length) => {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CROCKFORD[bytes[i] % 32];
  }
  return out;
};

export const generateHawkeyeRequestId = (date = new Date()) => {
  const timePart = encodeTime(date.getTime());
  const randomPart = randomChars(16);
  return `HK-AR-${timePart}${randomPart}`;
};

export const getCounterKey = (scopeType, scopeId, year) => {
  return `${scopeType}:${scopeId}:${year}:AUDIT_REQUEST`;
};

export const nextSeq = async (counterKey, session) => {
  const doc = await RequestIdCounter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
    { new: true, upsert: true, session }
  );
  return doc?.seq || 1;
};

const normalizeCode = (value) => String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const formatDisplayId = (tenantCode, yy, seq) => {
  const code = normalizeCode(tenantCode);
  const padded = String(seq).padStart(4, "0");
  return `${code}-AR-${yy}-${padded}`;
};

const deriveTenantCode = (tenant, tenantId, fallbackPrefix) => {
  const name = String(tenant?.displayName || tenant?.name || "").trim();
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  let code = "";
  if (parts.length >= 2) {
    code = parts.map((p) => p[0]).join("");
  } else if (cleaned) {
    code = cleaned.replace(/\s+/g, "").slice(0, 6);
  }
  code = normalizeCode(code);
  if (!code) {
    const suffix = String(tenantId || "").slice(-4).toUpperCase();
    code = normalizeCode(`${fallbackPrefix}${suffix}`);
  }
  return code.slice(0, 6);
};

export const resolveTenantCode = async (tenantId, fallbackPrefix) => {
  if (!tenantId) return deriveTenantCode(null, tenantId, fallbackPrefix);
  if (!mongoose.Types.ObjectId.isValid(tenantId)) {
    return deriveTenantCode(null, tenantId, fallbackPrefix);
  }
  const tenant = await Tenant.findById(tenantId).select("name displayName").lean();
  return deriveTenantCode(tenant, tenantId, fallbackPrefix);
};

const normalizeScopeId = (value) => {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return null;
};

const ensureAlias = async ({
  requestObjectId,
  hawkeyeRequestId,
  scopeType,
  scopeId,
  tenantCode,
  year,
  session,
}) => {
  if (!requestObjectId || !scopeId) return null;
  const existing = await AuditRequestAlias.findOne({
    requestObjectId,
    scopeType,
    scopeId,
  }).lean();
  if (existing) return existing;

  const counterKey = getCounterKey(scopeType, scopeId, year);
  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    const seq = await nextSeq(counterKey, session);
    const displayId = formatDisplayId(tenantCode, String(year).slice(-2), seq);
    try {
      const created = await AuditRequestAlias.create([
        {
          requestObjectId,
          hawkeyeRequestId,
          scopeType,
          scopeId,
          year,
          seq,
          displayId,
        },
      ], { session });
      return created?.[0] || null;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  return null;
};

export const ensureAuditRequestIds = async ({
  auditRequest,
  buyerTenantId,
  supplierTenantId,
  session,
}) => {
  if (!auditRequest) return {};
  const requestObjectId = auditRequest._id;
  const year = new Date(auditRequest.createdAt || Date.now()).getFullYear();

  let hawkeyeRequestId = auditRequest.hawkeyeRequestId;
  if (!hawkeyeRequestId) {
    hawkeyeRequestId = generateHawkeyeRequestId(new Date(auditRequest.createdAt || Date.now()));
    auditRequest.hawkeyeRequestId = hawkeyeRequestId;
    await auditRequest.save({ session });
  }

  const buyerScopeId = normalizeScopeId(buyerTenantId);
  const supplierScopeId = normalizeScopeId(supplierTenantId);

  const buyerTenantCode = await resolveTenantCode(buyerScopeId, "BUY");
  const supplierTenantCode = await resolveTenantCode(supplierScopeId, "SUP");

  const [buyerAlias, supplierAlias] = await Promise.all([
    buyerScopeId
      ? ensureAlias({
          requestObjectId,
          hawkeyeRequestId,
          scopeType: "BUYER_TENANT",
          scopeId: buyerScopeId,
          tenantCode: buyerTenantCode,
          year,
          session,
        })
      : null,
    supplierScopeId
      ? ensureAlias({
          requestObjectId,
          hawkeyeRequestId,
          scopeType: "SUPPLIER_TENANT",
          scopeId: supplierScopeId,
          tenantCode: supplierTenantCode,
          year,
          session,
        })
      : null,
  ]);

  return {
    hawkeyeRequestId,
    buyerAliasDisplayId: buyerAlias?.displayId,
    supplierAliasDisplayId: supplierAlias?.displayId,
  };
};

export const attachAliasesToRequests = async (requests = []) => {
  const ids = requests.map((r) => r?._id).filter(Boolean);
  if (!ids.length) return requests;
  const aliases = await AuditRequestAlias.find({ requestObjectId: { $in: ids } }).lean();
  const aliasMap = new Map();
  aliases.forEach((alias) => {
    const key = String(alias.requestObjectId);
    const entry = aliasMap.get(key) || {};
    if (alias.scopeType === "BUYER_TENANT") entry.buyerDisplayId = alias.displayId;
    if (alias.scopeType === "SUPPLIER_TENANT") entry.supplierDisplayId = alias.displayId;
    if (alias.hawkeyeRequestId) entry.hawkeyeRequestId = alias.hawkeyeRequestId;
    aliasMap.set(key, entry);
  });

  return requests.map((request) => {
    const entry = aliasMap.get(String(request._id)) || {};
    return {
      ...request,
      hawkeyeRequestId: request.hawkeyeRequestId || entry.hawkeyeRequestId,
      buyerDisplayId: entry.buyerDisplayId,
      supplierDisplayId: entry.supplierDisplayId,
    };
  });
};

export const resolveAuditRequestId = async ({ requestId, AuditRequestModel }) => {
  const auditModel = AuditRequestModel;
  if (!requestId) return null;
  if (mongoose.Types.ObjectId.isValid(requestId)) return requestId;

  const byHawk = await auditModel.findOne({ hawkeyeRequestId: requestId }).select("_id").lean();
  if (byHawk?._id) return String(byHawk._id);

  const alias = await AuditRequestAlias.findOne({ displayId: requestId }).select("requestObjectId").lean();
  if (alias?.requestObjectId) return String(alias.requestObjectId);

  const byLegacy = await auditModel
    .findOne({ $or: [{ internalRequestId: requestId }, { supplierRequestId: requestId }] })
    .select("_id")
    .lean();
  if (byLegacy?._id) return String(byLegacy._id);

  return null;
};
