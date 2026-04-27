/**
 * SupplierQualityEventAggregator
 *
 * One service that answers "what's open against this supplier across all EQMS modules?"
 *
 * Used by:
 *   - GET /api/suppliers/:id/quality-events           (Admin Panel · supplier detail)
 *   - complaintTriageService                          (so AI sees supplier history)
 *   - deviationFiveWhyScaffolder                      (so RCA sees prior patterns)
 *   - supplier scorecard refresh                      (post-CAPA-closure hook)
 *
 * Returns a normalized, paginated rollup. All queries scope by tenantId + supplierId
 * so no row-level leakage across tenants.
 */
import { Capa } from "../../models/capaModel.js";
import { Deviation } from "../../models/DeviationModel.js";
import { Complaint } from "../../models/ComplaintModel.js";
import ChangeControl from "../../models/ChangeControlModel.js";
import { AssessmentCapa } from "../../models/assessmentCapaModel.js";
import { AuditRequestMaster } from "../../models/auditRequestsMasterModel.js";
import { BatchRecord } from "../../models/BatchRecordModel.js";
import { Equipment } from "../../models/EquipmentModel.js";

const OPEN_CAPA_STATUSES = ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", "REWORK_REQUESTED", "OVERDUE"];
const OPEN_DEVIATION_STATUSES = ["REPORTED", "UNDER_ASSESSMENT", "UNDER_INVESTIGATION", "PENDING_DISPOSITION", "PENDING_CAPA_DECISION", "CAPA_REQUIRED", "PENDING_CLOSURE"];
const OPEN_COMPLAINT_STATUSES = ["OPEN", "UNDER_INVESTIGATION", "PENDING_CAPA"];
const OPEN_CHANGE_STATUSES = ["DRAFT", "SUBMITTED", "IMPACT_ASSESSMENT", "UNDER_REVIEW", "APPROVED", "IMPLEMENTATION", "VERIFICATION"];
const ACTIVE_AUDIT_PHASES = ["INITIATED", "PREP", "PLANNING", "SCHEDULING", "EXECUTION", "FINDINGS", "CAPA"];
const OPEN_BATCH_STATUSES = ["MANUFACTURING", "UNDER_REVIEW", "PENDING_LAB_RESULTS", "PENDING_QA_REVIEW", "PENDING_DEVIATION_CLOSURE", "PENDING_DISPOSITION", "QUARANTINED"];
const OPEN_EQUIPMENT_STATUSES = ["UNDER_CALIBRATION", "OUT_OF_SERVICE", "QUARANTINED"];

/**
 * @returns {Promise<{
 *   counts: { capas, deviations, complaints, changes, audits, total },
 *   capas: any[], deviations: any[], complaints: any[], changes: any[], audits: any[],
 *   recentlyClosed: { capas, deviations, complaints }   // last 90 days, for context
 * }>}
 */
export async function aggregateSupplierEvents({
  tenantId,
  tenantOrgKey = null,           // string-keyed tenant (used by Capa.tenantOrgId)
  supplierId,
  limit = 25,
  includeClosed = false,
  closedDays = 90,
} = {}) {
  if (!supplierId) return emptyResult();

  const since90 = new Date(Date.now() - closedDays * 86400_000);

  // V1 CAPA — uses tenantOrgId (string)
  const capaScope = tenantOrgKey ? { tenantOrgId: tenantOrgKey, supplierId } : { supplierId };
  const v1Capas = Capa
    ? await Capa.find({ ...capaScope, status: { $in: OPEN_CAPA_STATUSES } })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("title severity status targetDate auditId createdBy createdAt updatedAt").lean()
    : [];

  // V2 AssessmentCapa — uses tenantId (ObjectId)
  const v2Capas = AssessmentCapa && tenantId
    ? await AssessmentCapa.find({ tenantId, supplierId, status: { $in: OPEN_CAPA_STATUSES } })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("title severity status targetDate assessmentId findingId createdBy createdAt updatedAt").lean()
    : [];

  // Deviation
  const deviations = tenantId
    ? await Deviation.find({ tenantId, supplierId, status: { $in: OPEN_DEVIATION_STATUSES } })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("deviationNumber title classification status dateOfOccurrence supplierLot productName createdAt").lean()
    : [];

  // Complaint
  const complaints = tenantId
    ? await Complaint.find({ tenantId, supplierId, status: { $in: OPEN_COMPLAINT_STATUSES } })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("title severity status complaintType source mdrDueDate createdAt").lean()
    : [];

  // ChangeControl
  const changes = tenantId
    ? await ChangeControl.find({ tenantId, supplierId, status: { $in: OPEN_CHANGE_STATUSES } })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("changeNumber title changeType riskLevel status triggersRequalification createdAt").lean()
    : [];

  // Active audits — include rows whose phaseState is set to an active phase OR
  // for-cause audits that were just triggered (phaseState may not be set yet).
  const audits = tenantOrgKey
    ? await AuditRequestMaster.find({
        tenantOrgId: tenantOrgKey,
        supplier_id: supplierId,
        isArchived: { $ne: true },
        $or: [
          { "phaseState.currentPhase": { $in: ACTIVE_AUDIT_PHASES } },
          { auditType: "FOR_CAUSE", trackStatus: { $nin: ["Closed", "Archived"] } },
        ],
      })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("supplierRequestId trackStatus phaseState.currentPhase auditType auditor_id createdAt").lean()
    : [];

  // BatchRecord — match either the top-level primarySupplierId OR any BOM line item.
  const batches = tenantId
    ? await BatchRecord.find({
        tenantId,
        status: { $in: OPEN_BATCH_STATUSES },
        $or: [
          { primarySupplierId: supplierId },
          { "billOfMaterials.supplierId": supplierId },
        ],
      })
        .sort({ updatedAt: -1 }).limit(limit)
        .select("batchRecordNumber batchNumber productName status manufacturingDate primarySupplierId disposition createdAt").lean()
    : [];

  // Equipment — vendor accountability lens
  const equipment = tenantId
    ? await Equipment.find({
        tenantId: String(tenantId),
        vendorSupplierId: supplierId,
        $or: [
          { status: { $in: OPEN_EQUIPMENT_STATUSES } },
          { calibrationStatus: { $in: ["DUE_SOON", "OVERDUE"] } },
        ],
      })
        .sort({ nextCalibrationDue: 1 }).limit(limit)
        .select("equipmentNumber name equipmentType status calibrationStatus nextCalibrationDue manufacturer model").lean()
    : [];

  let recentlyClosed = { capas: 0, deviations: 0, complaints: 0 };
  if (includeClosed) {
    const closedCapasV1 = Capa
      ? await Capa.countDocuments({ ...capaScope, status: { $in: ["APPROVED", "CLOSED"] }, updatedAt: { $gte: since90 } })
      : 0;
    const closedCapasV2 = AssessmentCapa && tenantId
      ? await AssessmentCapa.countDocuments({ tenantId, supplierId, status: { $in: ["APPROVED", "CLOSED"] }, updatedAt: { $gte: since90 } })
      : 0;
    const closedDeviations = tenantId
      ? await Deviation.countDocuments({ tenantId, supplierId, status: { $in: ["CLOSED"] }, updatedAt: { $gte: since90 } })
      : 0;
    const closedComplaints = tenantId
      ? await Complaint.countDocuments({ tenantId, supplierId, status: { $in: ["CLOSED"] }, updatedAt: { $gte: since90 } })
      : 0;
    recentlyClosed = {
      capas: closedCapasV1 + closedCapasV2,
      deviations: closedDeviations,
      complaints: closedComplaints,
    };
  }

  const allCapas = [...v1Capas.map((c) => ({ ...c, lineage: "v1" })), ...v2Capas.map((c) => ({ ...c, lineage: "v2" }))];

  return {
    counts: {
      capas: allCapas.length,
      deviations: deviations.length,
      complaints: complaints.length,
      changes: changes.length,
      audits: audits.length,
      batches: batches.length,
      equipment: equipment.length,
      total: allCapas.length + deviations.length + complaints.length + changes.length + audits.length + batches.length + equipment.length,
    },
    capas: allCapas,
    deviations,
    complaints,
    changes,
    audits,
    batches,
    equipment,
    recentlyClosed,
  };
}

/**
 * Compact summary for AI prompt injection — small token footprint, headline-only.
 * Use this from complaintTriageService + deviationFiveWhyScaffolder.
 */
export async function buildSupplierContextForAi({ tenantId, tenantOrgKey, supplierId } = {}) {
  if (!supplierId) return null;
  const r = await aggregateSupplierEvents({ tenantId, tenantOrgKey, supplierId, limit: 5, includeClosed: true });
  if (r.counts.total === 0 && r.recentlyClosed.capas === 0) return null;

  return {
    supplierId: String(supplierId),
    open: r.counts,
    recentlyClosed: r.recentlyClosed,
    topOpenCapas: r.capas.slice(0, 3).map((c) => ({ title: c.title, severity: c.severity, status: c.status })),
    topOpenDeviations: r.deviations.slice(0, 3).map((d) => ({ title: d.title, classification: d.classification, lot: d.supplierLot })),
    topOpenComplaints: r.complaints.slice(0, 3).map((c) => ({ title: c.title, severity: c.severity, type: c.complaintType })),
  };
}

function emptyResult() {
  return {
    counts: { capas: 0, deviations: 0, complaints: 0, changes: 0, audits: 0, batches: 0, equipment: 0, total: 0 },
    capas: [], deviations: [], complaints: [], changes: [], audits: [], batches: [], equipment: [],
    recentlyClosed: { capas: 0, deviations: 0, complaints: 0 },
  };
}
