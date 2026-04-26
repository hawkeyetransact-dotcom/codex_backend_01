/**
 * Auto-EXPIRE scanner — flips records past their validUntil / closingAt
 * to terminal EXPIRED state. Covers:
 *   - supplier-pre-qualifications (validUntil < now AND status APPROVED / CONDITIONALLY_APPROVED → EXPIRED)
 *   - audit-rfqs (closingAt < now AND status PUBLISHED / QUOTES_RECEIVED → EXPIRED)
 */
import mongoose from "mongoose";

async function getModel(name) { try { return mongoose.model(name); } catch { return null; } }

export async function scanExpirations({ tenantId } = {}) {
  const now = new Date();
  const summary = { scannedAt: now, prequals: 0, rfqs: 0 };
  const filter = tenantId ? { tenantId } : {};

  // Supplier pre-qualifications
  const PQ = await getModel("supplier-pre-qualifications") || await getModel("SupplierPreQualification");
  if (PQ) {
    const r = await PQ.updateMany(
      {
        ...filter,
        validUntil: { $ne: null, $lt: now },
        status: { $in: ["APPROVED", "CONDITIONALLY_APPROVED"] },
      },
      { $set: { status: "EXPIRED", expiredAt: now } }
    );
    summary.prequals = r.modifiedCount || 0;
  }

  // Audit RFQs
  const RFQ = await getModel("audit-rfqs") || await getModel("AuditRfq");
  if (RFQ) {
    const r = await RFQ.updateMany(
      {
        ...filter,
        closingAt: { $ne: null, $lt: now },
        status: { $in: ["PUBLISHED", "QUOTES_RECEIVED", "IN_QA"] },
      },
      { $set: { status: "EXPIRED", expiredAt: now } }
    );
    summary.rfqs = r.modifiedCount || 0;
  }

  return { ok: true, ...summary };
}
