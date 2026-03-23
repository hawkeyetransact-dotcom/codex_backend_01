// ── Universal workflow platform role aliases (feature/universal-workflow-platform) ──
// Non-pharma roles resolve to their pharma equivalents for permit() checks.
// This allows 'inspector', 'verifier', etc. to pass auditor-gated routes.
const ROLE_ALIASES = {
  inspector: "auditor",
  verifier: "auditor",
  certifier: "auditor",
  reviewer: "auditor",
  counterparty: "buyer",
  party_admin: "supplier",
  party_user: "supplieruser",
  workflow_manager: "admin",
};

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
    const rawRole = normalizeRole(req.user?.role);
    // Resolve alias: inspector → auditor, party_admin → supplier, etc.
    const role = ROLE_ALIASES[rawRole] ?? rawRole;
    const allowed = allowedRoles.map((item) => normalizeRole(item));
    if (allowed.includes(role) || allowed.includes(rawRole)) {
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
