import { ComplianceStandardRegistry } from "../../models/complianceStandardRegistryModel.js";
import { DEFAULT_COMPLIANCE_STANDARDS } from "../../modules/compliance/defaultStandards.js";
import {
  COMPLIANCE_STANDARD_STATUSES,
  DEFAULT_STANDARD_VERSION,
} from "../../modules/compliance/constants.js";

const trim = (value) => String(value || "").trim();

const normalizeStandardKey = (value) =>
  trim(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "STANDARD";

const normalizeVersion = (value) => trim(value) || DEFAULT_STANDARD_VERSION;

const normalizeStringList = (value, max = 100) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.forEach((item) => {
    const next = trim(item);
    if (!next) return;
    if (out.includes(next)) return;
    if (out.length >= max) return;
    out.push(next);
  });
  return out;
};

const sanitizeControl = (control = {}, idx = 0) => {
  const controlId = normalizeStandardKey(control.controlId || `CONTROL_${idx + 1}`);
  const title = trim(control.title || control.name || controlId);
  return {
    controlId,
    title: title || controlId,
    description: trim(control.description || ""),
    clauseRef: trim(control.clauseRef || ""),
    standardRefs: normalizeStringList(control.standardRefs || []),
    keywords: normalizeStringList(control.keywords || []).map((item) => item.toLowerCase()),
    expectedAnswer: ["YES", "NO", "TEXT", "ANY"].includes(trim(control.expectedAnswer).toUpperCase())
      ? trim(control.expectedAnswer).toUpperCase()
      : "ANY",
    requiredEvidence: Boolean(control.requiredEvidence),
    weight: Number.isFinite(Number(control.weight)) ? Math.max(0, Number(control.weight)) : 1,
    active: control.active !== false,
  };
};

const sanitizePayload = ({ payload = {}, fallback = {} } = {}) => {
  const source = { ...fallback, ...payload };
  const controlsRaw = Array.isArray(source.controls) ? source.controls : [];
  const controls = controlsRaw
    .map((item, idx) => sanitizeControl(item, idx))
    .filter((item, idx, arr) => arr.findIndex((other) => other.controlId === item.controlId) === idx);

  return {
    standardKey: normalizeStandardKey(source.standardKey || fallback.standardKey),
    version: normalizeVersion(source.version || fallback.version),
    name: trim(source.name || fallback.name || ""),
    description: trim(source.description || fallback.description || ""),
    domain: trim(source.domain || fallback.domain || "GMP") || "GMP",
    scope: ["TENANT", "GLOBAL"].includes(trim(source.scope || fallback.scope || "TENANT").toUpperCase())
      ? trim(source.scope || fallback.scope || "TENANT").toUpperCase()
      : "TENANT",
    status: COMPLIANCE_STANDARD_STATUSES.includes(trim(source.status || fallback.status || "ACTIVE").toUpperCase())
      ? trim(source.status || fallback.status || "ACTIVE").toUpperCase()
      : "ACTIVE",
    controls,
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : {},
  };
};

const ensureDefaults = async ({ tenantId, actorUserId = null }) => {
  if (!tenantId) return;
  for (const item of DEFAULT_COMPLIANCE_STANDARDS) {
    const sanitized = sanitizePayload({ payload: item, fallback: item });
    await ComplianceStandardRegistry.findOneAndUpdate(
      {
        tenantId,
        standardKey: sanitized.standardKey,
        version: sanitized.version,
      },
      {
        $setOnInsert: {
          ...sanitized,
          tenantId,
          createdBy: actorUserId || undefined,
          updatedBy: actorUserId || undefined,
        },
      },
      { upsert: true, new: true }
    );
  }
};

export const StandardRegistryService = {
  normalizeStandardKey,
  normalizeVersion,

  async ensureDefaults({ tenantId, actorUserId = null }) {
    await ensureDefaults({ tenantId, actorUserId });
  },

  async listStandards({
    tenantId,
    includeControls = false,
    includeArchived = false,
    actorUserId = null,
  }) {
    await ensureDefaults({ tenantId, actorUserId });
    const query = { tenantId };
    if (!includeArchived) {
      query.status = "ACTIVE";
    }
    const projection = includeControls ? {} : { controls: 0 };
    return ComplianceStandardRegistry.find(query, projection)
      .sort({ standardKey: 1, version: -1 })
      .lean();
  },

  async getStandard({ tenantId, standardKey, version, actorUserId = null }) {
    await ensureDefaults({ tenantId, actorUserId });
    const key = normalizeStandardKey(standardKey);
    const ver = normalizeVersion(version);
    return ComplianceStandardRegistry.findOne({
      tenantId,
      standardKey: key,
      version: ver,
    }).lean();
  },

  async createStandard({ tenantId, payload, actorUserId }) {
    const sanitized = sanitizePayload({ payload });
    if (!sanitized.standardKey) throw new Error("standardKey is required");
    if (!sanitized.name) throw new Error("name is required");
    const existing = await ComplianceStandardRegistry.findOne({
      tenantId,
      standardKey: sanitized.standardKey,
      version: sanitized.version,
    }).lean();
    if (existing) {
      const err = new Error("Standard version already exists");
      err.status = 409;
      throw err;
    }
    const created = await ComplianceStandardRegistry.create({
      tenantId,
      ...sanitized,
      createdBy: actorUserId || undefined,
      updatedBy: actorUserId || undefined,
    });
    return created.toObject();
  },

  async updateStandard({ tenantId, standardKey, version, payload, actorUserId }) {
    const existing = await ComplianceStandardRegistry.findOne({
      tenantId,
      standardKey: normalizeStandardKey(standardKey),
      version: normalizeVersion(version),
    });
    if (!existing) return null;

    const sanitized = sanitizePayload({
      payload: {
        ...payload,
        standardKey: existing.standardKey,
        version: existing.version,
      },
      fallback: existing.toObject(),
    });

    existing.name = sanitized.name;
    existing.description = sanitized.description;
    existing.domain = sanitized.domain;
    existing.scope = sanitized.scope;
    existing.status = sanitized.status;
    existing.controls = sanitized.controls;
    existing.metadata = sanitized.metadata;
    existing.updatedBy = actorUserId || existing.updatedBy;
    await existing.save();
    return existing.toObject();
  },
};

