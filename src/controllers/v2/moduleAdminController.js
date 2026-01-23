import { TenantModuleConfig } from "../../models/tenantModuleConfigModel.js";
import { ComplianceStandard } from "../../models/complianceStandardModel.js";
import { ensureTenantModuleConfig, sanitizeModules } from "../../services/moduleConfigService.js";

export const getModuleConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const config = await ensureTenantModuleConfig(tenantId);
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("getModuleConfig error", error);
    return res.status(500).json({ error: "Failed to load module config" });
  }
};

export const updateModuleConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const enabledModules = sanitizeModules(req.body?.enabledModules || []);
    const defaultModule = req.body?.defaultModule;
    if (defaultModule && !enabledModules.includes(defaultModule)) {
      return res.status(400).json({ error: "defaultModule must be in enabledModules" });
    }

    const config = await TenantModuleConfig.findOneAndUpdate(
      { tenantId },
      {
        enabledModules,
        defaultModule: defaultModule || enabledModules[0] || "cGMP",
        moduleSettings: req.body?.moduleSettings || {},
      },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("updateModuleConfig error", error);
    return res.status(500).json({ error: "Failed to update module config" });
  }
};

export const listStandards = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const standards = await ComplianceStandard.find({ tenantId }).sort({ name: 1 }).lean();
    return res.json({ success: true, data: standards });
  } catch (error) {
    console.error("listStandards error", error);
    return res.status(500).json({ error: "Failed to load standards" });
  }
};
