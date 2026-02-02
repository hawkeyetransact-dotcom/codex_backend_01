import SystemSetting from "../models/systemSettingModel.js";

const LLM_SETTING_KEY = "llm_provider";
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
