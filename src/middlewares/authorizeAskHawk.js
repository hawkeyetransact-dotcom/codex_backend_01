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

  const tenantId = authTenantId || suppliedTenantId;
  if (!tenantId) return res.status(400).json({ message: "tenantId required" });

  if (authTenantId && suppliedTenantId && String(authTenantId) !== String(suppliedTenantId)) {
    return res.status(403).json({ message: "Forbidden: tenant mismatch" });
  }

  req.askContext = { tenantId: String(tenantId), role };
  return next();
};
