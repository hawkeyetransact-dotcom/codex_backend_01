import { AuditEvent } from "../models/auditEventModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";

const loadAudit = async (req) => {
  const rawId = req.params.auditId;
  const resolvedId = await resolveAuditRequestId({
    requestId: rawId,
    AuditRequestModel: AuditRequestMaster,
  });
  const audit = await AuditRequestMaster.findById(resolvedId || rawId);
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  if (audit.tenantOrgId && req.tenantId) {
    assertSameTenant(audit.tenantOrgId, req.tenantId);
  }
  return audit;
};

export const listAuditEvents = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const items = await AuditEvent.find({ tenantId, auditId: audit._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load audit events" });
  }
};
