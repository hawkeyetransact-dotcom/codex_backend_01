const normalizeRole = (value) => {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "";
  const compact = raw.replace(/[\s_-]/g, "");
  if (compact === "supplieradmin") return "supplier";
  if (compact === "supplieruser") return "supplieruser";
  if (compact === "tenantadmin") return "tenant_admin";
  if (compact === "superadmin") return "superadmin";
  return raw;
};

export const permit = (...allowedRoles) => {
  return (req, res, next) => {
    const role = normalizeRole(req.user?.role);
    const allowed = allowedRoles.map((item) => normalizeRole(item));
    if (allowed.includes(role)) {
      next();
    } else {
      return res
        .status(403)
        .json({
          error: "Forbidden: You don't have permission to access this resource.",
        });
    }
  };
};
