const PLATFORM_ADMIN_EMAIL_ALLOWLIST = new Set(
  String(process.env.ASKHAWK_PLATFORM_ADMIN_EMAILS || "hawkeye-admin@test.com")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
);
const PLATFORM_FALLBACK_ROLES = new Set(["admin", "superadmin", "tenant_admin", "platform_admin", "platform-admin"]);

export const authorizeAskHawk = (req, res, next) => {
  const authTenantId =
    req.tenantId ||
    req.user?.tenant_id ||
    req.user?.tenantId ||
    req.user?.tenantOrgId;
  const suppliedTenantId =
    req.headers["x-tenant-id"] ||
    req.body?.tenantId ||
    req.query?.tenantId ||
    null;
  const role =
    req.user?.role ||
    req.headers["x-role"] ||
    req.body?.role ||
    req.query?.role ||
    null;

  const normalizedRole = String(role || "").toLowerCase();
  const adminScope = String(req.adminScope || req.user?.adminScope || "").toUpperCase();
  const email = String(req.user?.email || "").trim().toLowerCase();
  const isScopePlatformAdmin =
    adminScope === "PLATFORM" && (normalizedRole === "admin" || normalizedRole === "superadmin");
  const isFallbackPlatformAdmin =
    normalizedRole === "superadmin" ||
    (PLATFORM_FALLBACK_ROLES.has(normalizedRole) && PLATFORM_ADMIN_EMAIL_ALLOWLIST.has(email));
  const isPlatformAdmin = isScopePlatformAdmin || isFallbackPlatformAdmin;

  const tenantId = isPlatformAdmin ? suppliedTenantId || "__platform__" : authTenantId || suppliedTenantId || null;
  if (!tenantId) return res.status(400).json({ message: "tenantId required" });

  if (!isPlatformAdmin && authTenantId && suppliedTenantId && String(authTenantId) !== String(suppliedTenantId)) {
    return res.status(403).json({ message: "Forbidden: tenant mismatch" });
  }

  req.askContext = {
    tenantId: String(tenantId),
    role,
    adminScope: req.adminScope || req.user?.adminScope || "NONE",
    isPlatformAdmin,
  };
  return next();
};
