export const authorizeAskHawk = (req, res, next) => {
  const tenantId = req.headers["x-tenant-id"] || req.body?.tenantId || req.query?.tenantId;
  const role = req.headers["x-role"] || req.body?.role || req.query?.role;
  if (!tenantId) return res.status(400).json({ message: "tenantId required" });
  if (!role) return res.status(400).json({ message: "role required" });
  req.askContext = { tenantId, role };
  return next();
};
