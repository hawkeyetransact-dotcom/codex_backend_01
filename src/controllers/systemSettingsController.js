import SystemSetting from "../models/systemSettingModel.js";
import { AIPreviewService } from "../services/aiPreviewService.js";

const LLM_SETTING_KEY = "llm_provider";
const PREVIEW_MODE_SETTING_KEY = "ai_preview_mode";
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
    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant missing" });
    }
    const key = resolvePreviewModeKey(req.tenantId);
    const setting = await SystemSetting.findOne({ key }).lean();
    const enabled = Boolean(setting?.value?.enabled);
    return res.json({
      enabled,
      source: setting ? "db" : "default",
      updatedAt: setting?.updatedAt || null,
    });
  } catch (err) {
    console.error("getPreviewModeSettings", err);
    return res.status(500).json({ error: "Failed to load preview mode settings" });
  }
};

export const updatePreviewModeSettings = async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant missing" });
    }
    const enabled = toBool(req.body?.enabled, false);
    const key = resolvePreviewModeKey(req.tenantId);
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
    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant missing" });
    }
    const key = resolvePreviewModeKey(req.tenantId);
    const setting = await SystemSetting.findOne({ key }).lean();
    const enabled = Boolean(setting?.value?.enabled);
    if (!enabled) {
      return res.status(403).json({
        error: "Preview mode is disabled. Enable it in settings before running analysis.",
      });
    }

    const data = await AIPreviewService.run({
      tenantId: req.tenantId,
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
