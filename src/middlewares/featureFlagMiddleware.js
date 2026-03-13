import { ensureTenantModuleConfig, buildTenantModuleAccess } from "../services/moduleConfigService.js";

export const requireFeatureFlag = (flagValue, message = "Feature disabled") => {
  return (_req, res, next) => {
    if (!flagValue) {
      return res.status(404).json({ message });
    }
    next();
  };
};

export const requireFeatureEnabled = (resolver, message = "Feature disabled") => {
  return async (req, res, next) => {
    try {
      const enabled = await resolver(req);
      if (!enabled) {
        return res.status(404).json({ message });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ message: error.message || "Feature check failed" });
    }
  };
};

export const requireTenantFeature = (moduleSettingKey, message = "Feature disabled") => {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(403).json({ message: "Tenant context missing" });
      }
      const config = await ensureTenantModuleConfig(req.tenantId);
      const access = buildTenantModuleAccess(config);
      const moduleSettings = access?.moduleSettings || {};
      const enabled =
        access?.flags?.[`${moduleSettingKey}Enabled`] ??
        Boolean(moduleSettings?.[moduleSettingKey]?.enabled);
      if (!enabled) {
        return res.status(404).json({ message });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ message: error.message || "Feature check failed" });
    }
  };
};

export const requireAnyTenantFeature = (moduleSettingKeys = [], message = "Feature disabled") => {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(403).json({ message: "Tenant context missing" });
      }
      const config = await ensureTenantModuleConfig(req.tenantId);
      const access = buildTenantModuleAccess(config);
      const moduleSettings = access?.moduleSettings || {};
      const enabled = moduleSettingKeys.some((moduleSettingKey) => {
        return (
          access?.flags?.[`${moduleSettingKey}Enabled`] ??
          Boolean(moduleSettings?.[moduleSettingKey]?.enabled)
        );
      });
      if (!enabled) {
        return res.status(404).json({ message });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ message: error.message || "Feature check failed" });
    }
  };
};
