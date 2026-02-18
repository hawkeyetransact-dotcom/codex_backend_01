import {
  buildTenantModuleAccess,
  ensureTenantModuleConfig,
} from "../services/moduleConfigService.js";

const resolveAccess = async (req) => {
  if (req.moduleAccess) return req.moduleAccess;
  if (!req.tenantId) return null;
  const config = await ensureTenantModuleConfig(req.tenantId);
  const access = buildTenantModuleAccess(config);
  req.moduleAccess = access;
  return access;
};

export const requireVaultAccess = (level = "lite") => async (req, res, next) => {
  try {
    const access = await resolveAccess(req);
    if (!access) {
      return res.status(400).json({ error: "Tenant context missing" });
    }

    const hasLite = Boolean(
      access?.flags?.vaultLiteEnabled || access?.entitlements?.vaultLite || access?.entitlements?.vaultFull
    );
    const hasFull = Boolean(
      access?.flags?.vaultFullEnabled || access?.entitlements?.vaultFull
    );
    const allowed = level === "full" ? hasFull : hasLite || hasFull;

    if (!allowed) {
      return res.status(403).json({
        error: "Vault access is not enabled for this tenant plan.",
      });
    }
    return next();
  } catch (error) {
    console.error("requireVaultAccess error", error);
    return res.status(500).json({ error: "Failed to resolve module access" });
  }
};

