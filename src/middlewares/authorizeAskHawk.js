export const authorizeAskHawk = (req, res, next) => {
  const tenantId =
    req.headers["x-tenant-id"] ||
    req.body?.tenantId ||
    req.query?.tenantId ||
    req.user?.tenantId ||
    req.user?.tenantOrgId;
  const role =
    req.headers["x-role"] ||
    req.body?.role ||
    req.query?.role ||
    req.user?.role;
  if (!tenantId) return res.status(400).json({ message: "tenantId required" });
  req.askContext = { tenantId, role };
  return next();
};
