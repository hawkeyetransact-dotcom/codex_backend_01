export const permit = (...allowedRoles) => {
  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    const allowed = allowedRoles.map((item) => String(item).toLowerCase());
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
