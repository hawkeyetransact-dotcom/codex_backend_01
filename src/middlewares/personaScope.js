/**
 * personaScope.js
 *
 * Auto-scopes list filters to "rows that belong to me" for non-admin personas.
 *
 * Default tenant filter is { tenantId } which over-shares: any logged-in
 * supplier sees every other supplier's records in the same tenant. This
 * helper lets a route declare "the supplier-attribution column on this
 * resource is X, the auditor-attribution column is Y" and we'll inject the
 * right id constraint based on who's calling.
 *
 *   import { applyPersonaScope } from "../middlewares/personaScope.js";
 *
 *   router.get("/", async (req, res) => {
 *     const filter = applyPersonaScope(req, { tenantId: req.tenantId },
 *       { supplierField: "supplierId", auditorField: "auditorId" });
 *     ...
 *   });
 *
 * Buyers, tenant_admin, admin, superadmin are NOT scoped — they see the full
 * tenant. Only suppliers are forced to supplierId=me, auditors to auditorId=me.
 */

const ADMIN_ROLES = new Set(["tenant_admin", "admin", "superadmin", "buyer", "workflow_manager", "inspector", "verifier", "reviewer"]);
const SUPPLIER_ROLES = new Set(["supplier", "supplierUser"]);
const AUDITOR_ROLES = new Set(["auditor"]);

/**
 * @param {object} req           Express request (must have req.user)
 * @param {object} baseFilter    Mongoose filter object to extend
 * @param {object} fields
 * @param {string} [fields.supplierField]  field name on the resource that holds the supplier user id
 * @param {string} [fields.auditorField]   field name on the resource that holds the auditor user id
 * @returns {object} filter with persona scope applied (non-mutating)
 */
export function applyPersonaScope(req, baseFilter = {}, { supplierField, auditorField } = {}) {
  const role = req.user?.role;
  const userId = req.user?._id;
  const adminScope = req.user?.adminScope;

  if (adminScope === "PLATFORM" || ADMIN_ROLES.has(role)) {
    return { ...baseFilter };
  }
  if (SUPPLIER_ROLES.has(role) && supplierField && userId) {
    return { ...baseFilter, [supplierField]: userId };
  }
  if (AUDITOR_ROLES.has(role) && auditorField && userId) {
    return { ...baseFilter, [auditorField]: userId };
  }
  // Unknown persona — deny by adding an impossible filter so we don't leak.
  return { ...baseFilter, _personaScopeDeny: true };
}
