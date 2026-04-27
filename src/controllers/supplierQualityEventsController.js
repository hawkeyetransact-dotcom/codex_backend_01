/**
 * GET /api/suppliers/:supplierId/quality-events
 *
 * Returns the unified roll-up of open EQMS events for one supplier
 * (CAPAs · deviations · complaints · changes · audits).
 *
 * Tenant-scoped via authenticate middleware. The aggregator only returns
 * rows scoped to this tenant, so no cross-tenant leakage.
 */
import { aggregateSupplierEvents } from "../services/crossModule/supplierQualityEventService.js";
import Tenant from "../models/tenantModel.js";

function tc(req) {
  return {
    tenantId: req.tenantId || req.user?.tenant_id,
    userId: req.user?._id,
  };
}

export async function getSupplierQualityEvents(req, res) {
  const { tenantId } = tc(req);
  const { supplierId } = req.params;

  if (!supplierId) return res.status(400).json({ error: "supplierId_required" });
  if (!tenantId) return res.status(400).json({ error: "tenant_required" });

  const includeClosed = req.query.includeClosed === "true" || req.query.includeClosed === "1";
  const limit = Math.min(Math.max(parseInt(req.query.limit || "25", 10), 1), 200);

  // Resolve the string-keyed tenantOrgId for V1 CAPA / audit lookups.
  let tenantOrgKey = null;
  try {
    const tenant = await Tenant.findById(tenantId).select("name").lean();
    tenantOrgKey = tenant?.name || null;
  } catch { /* non-fatal */ }

  const result = await aggregateSupplierEvents({
    tenantId, tenantOrgKey, supplierId,
    limit, includeClosed,
  });

  return res.json({
    supplierId,
    tenantId: String(tenantId),
    ...result,
  });
}
