import SystemSetting from "../models/systemSettingModel.js";
import Tenant from "../models/tenantModel.js";
import { AIPreviewService } from "../services/aiPreviewService.js";

const LLM_SETTING_KEY = "llm_provider";
const PREVIEW_MODE_SETTING_KEY = "ai_preview_mode";
const DEFAULT_PREVIEW_MODE_ENABLED = true;
const PROVIDERS = new Set(["gemini", "local"]);

const normalizeProvider = (value) => {
  if (!value) return null;
  const candidate = String(value).toLowerCase();
  return PROVIDERS.has(candidate) ? candidate : null;
};

const resolveDefaultProvider = () => {
  const envProvider = normalizeProvider(process.env.LLM_PROVIDER);
  if (envProvider) return envProvider;
  if (process.env.LLM_SERVICE_URL || process.env.MCP_LLM_URL) return "local";
  return "gemini";
};

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

const resolvePreviewModeKey = (tenantId) => {
  if (!tenantId) return PREVIEW_MODE_SETTING_KEY;
  return `${PREVIEW_MODE_SETTING_KEY}:${tenantId}`;
};

const toStatusError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const isPlatformSession = (req) =>
  req?.adminScope === "PLATFORM" || req?.user?.adminScope === "PLATFORM";

const normalizeTenantId = (value) => {
  const raw = String(value || "").trim();
  return raw || null;
};

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeTenantToken = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/\d+/g, (digits) => String(Number(digits)));

const resolveTenantByIdentifier = async (identifier) => {
  const token = normalizeTenantId(identifier);
  if (!token) return null;
  const projection = "_id status name displayName";

  if (isObjectId(token)) {
    return Tenant.findById(token).select(projection).lean();
  }

  const exactPattern = new RegExp(`^${escapeRegExp(token)}$`, "i");
  let tenant = await Tenant.findOne({
    $or: [{ name: exactPattern }, { displayName: exactPattern }],
  })
    .select(projection)
    .lean();
  if (tenant) return tenant;

  const canonical = normalizeTenantToken(token);
  if (!canonical) return null;
  const tenants = await Tenant.find({}, projection).lean();
  tenant =
    tenants.find(
      (item) =>
        normalizeTenantToken(item?.name) === canonical ||
        normalizeTenantToken(item?.displayName) === canonical
    ) || null;
  return tenant;
};

const resolvePreviewTenantId = (req) => {
  const directTenantId = normalizeTenantId(req.tenantId || req.user?.tenant_id);
  if (directTenantId) return directTenantId;
  if (!isPlatformSession(req)) return null;
  return normalizeTenantId(
    req.headers?.["x-tenant-id"] ||
      req.body?.tenantId ||
      req.query?.tenantId
  );
};

const resolvePreviewTenantContext = async (req) => {
  const tenantIdentifier = resolvePreviewTenantId(req);
  if (!tenantIdentifier) {
    throw toStatusError(
      400,
      "Tenant context missing. Provide tenantId for platform admin sessions."
    );
  }
  const tenant = await resolveTenantByIdentifier(tenantIdentifier);
  if (!tenant) {
    throw toStatusError(
      404,
      "Tenant not found. Use tenant ID, tenant name, or display name."
    );
  }
  if (tenant.status !== "ACTIVE") {
    throw toStatusError(403, "Tenant suspended");
  }
  return { tenantId: String(tenant._id) };
};

export const getLlmSettings = async (req, res) => {
  try {
    const setting = await SystemSetting.findOne({ key: LLM_SETTING_KEY }).lean();
    const provider = normalizeProvider(setting?.value?.provider) || resolveDefaultProvider();
    res.json({
      provider,
      source: setting ? "db" : "env",
      updatedAt: setting?.updatedAt || null,
    });
  } catch (err) {
    console.error("getLlmSettings", err);
    res.status(500).json({ error: "Failed to load LLM settings" });
  }
};

export const updateLlmSettings = async (req, res) => {
  try {
    const provider = normalizeProvider(req.body?.provider);
    if (!provider) {
      return res.status(400).json({ error: "Invalid provider" });
    }
    const setting = await SystemSetting.findOneAndUpdate(
      { key: LLM_SETTING_KEY },
      { $set: { value: { provider }, updatedBy: req.user?._id || null } },
      { upsert: true, new: true }
    );
    res.json({
      provider: setting?.value?.provider,
      updatedAt: setting?.updatedAt || null,
    });
  } catch (err) {
    console.error("updateLlmSettings", err);
    res.status(500).json({ error: "Failed to update LLM settings" });
  }
};

export const getPreviewModeSettings = async (req, res) => {
  try {
    const { tenantId } = await resolvePreviewTenantContext(req);
    const key = resolvePreviewModeKey(tenantId);
    const setting = await SystemSetting.findOne({ key }).lean();
    const enabled =
      setting?.value?.enabled === undefined
        ? DEFAULT_PREVIEW_MODE_ENABLED
        : Boolean(setting?.value?.enabled);
    return res.json({
      tenantId,
      enabled,
      source: setting ? "db" : "default_enabled",
      updatedAt: setting?.updatedAt || null,
    });
  } catch (err) {
    console.error("getPreviewModeSettings", err);
    return res.status(500).json({ error: "Failed to load preview mode settings" });
  }
};

export const updatePreviewModeSettings = async (req, res) => {
  try {
    const { tenantId } = await resolvePreviewTenantContext(req);
    const enabled = toBool(req.body?.enabled, false);
    const key = resolvePreviewModeKey(tenantId);
    const setting = await SystemSetting.findOneAndUpdate(
      { key },
      {
        $set: {
          value: { enabled },
          updatedBy: req.user?._id || null,
        },
      },
      { upsert: true, new: true }
    ).lean();
    return res.json({
      tenantId,
      enabled: Boolean(setting?.value?.enabled),
      updatedAt: setting?.updatedAt || null,
    });
  } catch (err) {
    console.error("updatePreviewModeSettings", err);
    return res.status(500).json({ error: "Failed to update preview mode settings" });
  }
};

export const runPreviewModeAnalysis = async (req, res) => {
  try {
    const { tenantId } = await resolvePreviewTenantContext(req);
    const key = resolvePreviewModeKey(tenantId);
    const setting = await SystemSetting.findOne({ key }).lean();
    const enabled =
      setting?.value?.enabled === undefined
        ? DEFAULT_PREVIEW_MODE_ENABLED
        : Boolean(setting?.value?.enabled);
    if (!enabled) {
      return res.status(403).json({
        error: "Preview mode is disabled. Enable it in settings before running analysis.",
      });
    }

    const data = await AIPreviewService.run({
      tenantId,
      actorUserId: req.user?._id,
      payload: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    console.error("runPreviewModeAnalysis", err);
    return res.status(err.status || 500).json({
      error: err.message || "Failed to run preview analysis",
    });
  }
};
