/**
 * crossModuleService.js — Phase 1 cross-module intelligence.
 *
 * Wires EQMS modules together:
 *   1. Document revision → auto-assign training
 *   2. CAPA deadline enforcement based on GMP classification
 *   3. Risk event / CAPA failure → for-cause audit trigger
 *   4. KPI aggregation for Management Review
 *   5. Deviation → auto-create CAPA
 *   6. Complaint → auto-flag regulatory reporting
 *   7. Supplier scorecard calculation
 *   8. Equipment PM overdue alerts
 */

// ── 1. Auto-assign training on SOP revision ──────────────────────────────────
export async function triggerTrainingOnDocumentRevision(documentControlRecord, userId) {
  const { default: mongoose } = await import("mongoose");
  const TrainingRecord = mongoose.model("TrainingRecord");

  if (!documentControlRecord.requiresTrainingOnUpdate) return [];

  // Find all users in the same department/tenant who need retraining
  const { User } = await import("../models/userModel.js");
  const tenantUsers = await User.find({
    tenant_id: documentControlRecord.tenantId,
    status: "ACTIVE",
  }).select("_id email role").lean();

  const created = [];
  const dueDays = documentControlRecord.trainingDueDays || 30;
  const dueDate = new Date(Date.now() + dueDays * 86400000);

  for (const user of tenantUsers) {
    const exists = await TrainingRecord.findOne({
      traineeId: user._id,
      documentControlId: documentControlRecord._id,
      documentVersion: `${documentControlRecord.versionMajor}.${documentControlRecord.versionMinor}`,
      status: { $nin: ["COMPLETED", "WAIVED"] },
    });
    if (exists) continue;

    const record = await TrainingRecord.create({
      tenantId: documentControlRecord.tenantId,
      traineeId: user._id,
      traineeName: user.email,
      traineeRole: user.role,
      department: documentControlRecord.departmentOwner || "General",
      trainingType: "SOP_READ_AND_UNDERSTAND",
      trainingTitle: `Read & Understand: ${documentControlRecord.title} (v${documentControlRecord.versionMajor}.${documentControlRecord.versionMinor})`,
      documentControlId: documentControlRecord._id,
      documentVersion: `${documentControlRecord.versionMajor}.${documentControlRecord.versionMinor}`,
      assignedBy: userId,
      assignedAt: new Date(),
      dueDate,
      status: "ASSIGNED",
    });
    created.push(record._id);
  }
  return created;
}

// ── 2. CAPA deadline based on GMP classification ─────────────────────────────
const GMP_DEADLINES = {
  CRITICAL: 15,
  MAJOR: 30,
  MINOR: 60,
  OBSERVATION: 90,
};

export function computeCapaDeadlineDays(gmpClassification) {
  return GMP_DEADLINES[gmpClassification] || 30;
}

export function computeCapaDeadlineDate(gmpClassification, fromDate = new Date()) {
  const days = computeCapaDeadlineDays(gmpClassification);
  return new Date(fromDate.getTime() + days * 86400000);
}

// ── 3. For-cause audit trigger ───────────────────────────────────────────────
export async function triggerForCauseAudit({ tenantId, supplierId, reason, triggeredBy, sourceType, sourceId }) {
  const { AuditRequestMaster } = await import("../models/auditRequestsMasterModel.js");

  // Check if a for-cause audit already exists for this supplier (avoid duplicates)
  const existing = await AuditRequestMaster.findOne({
    tenantOrgId: tenantId,
    supplier_id: supplierId,
    auditType: "FOR_CAUSE",
    isArchived: { $ne: true },
    trackStatus: { $nin: ["Closed", "Archived"] },
  });
  if (existing) return { created: false, existingId: existing._id, reason: "For-cause audit already open" };

  // Create the audit request stub — buyer must complete it
  const audit = await AuditRequestMaster.create({
    tenantOrgId: tenantId,
    supplier_id: supplierId,
    trackStatus: "For-Cause Audit Triggered",
    questionnaireStatus: "request_received",
    high_status: 1,
    supplierVisible: false,
    nextAuditOn: "buyer",
    auditType: "FOR_CAUSE",
    forCauseReason: reason,
    forCauseTriggeredBy: triggeredBy,
    forCauseSourceType: sourceType,
    forCauseSourceId: sourceId,
  });

  return { created: true, auditId: audit._id };
}

// ── 4. KPI aggregation for Management Review ─────────────────────────────────
export async function aggregateQualityKPIs(tenantId, periodStart, periodEnd) {
  const { default: mongoose } = await import("mongoose");
  const dateFilter = { createdAt: { $gte: periodStart, $lte: periodEnd } };
  const tenantFilter = tenantId ? { tenantId } : {};
  const tenantOrgFilter = tenantId ? { tenantOrgId: tenantId } : {};
  const combined = { ...tenantFilter, ...dateFilter };
  const combinedOrg = { ...tenantOrgFilter, ...dateFilter };

  const safeCount = async (modelName, filter) => {
    try {
      const Model = mongoose.model(modelName);
      return await Model.countDocuments(filter);
    } catch { return 0; }
  };

  const [
    totalAudits, closedAudits,
    totalCapas, closedCapas, overdueCapas,
    totalDeviations, criticalDeviations,
    totalComplaints, openComplaints,
    totalTraining, completedTraining, overdueTraining,
    totalChangeControls, openChangeControls,
    equipmentOverdue,
    totalDocuments, documentsForReview,
  ] = await Promise.all([
    safeCount("audit-requests-masters", { ...combinedOrg, isArchived: { $ne: true } }),
    safeCount("audit-requests-masters", { ...combinedOrg, high_status: 5 }),
    safeCount("CapaV2", combined),
    safeCount("CapaV2", { ...combined, status: { $regex: /^CLOSED/ } }),
    safeCount("CapaV2", { ...combined, status: { $nin: ["CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "CANCELLED"] }, "actionPlan.targetDate": { $lt: new Date() } }),
    safeCount("Deviation", combined),
    safeCount("Deviation", { ...combined, classification: "CRITICAL" }),
    safeCount("Complaint", combined),
    safeCount("Complaint", { ...combined, status: { $nin: ["CLOSED", "CANCELLED"] } }),
    safeCount("TrainingRecord", combined),
    safeCount("TrainingRecord", { ...combined, status: "COMPLETED" }),
    safeCount("TrainingRecord", { ...combined, status: "OVERDUE" }),
    safeCount("ChangeControl", combined),
    safeCount("ChangeControl", { ...combined, status: { $nin: ["CLOSED", "CANCELLED"] } }),
    safeCount("Equipment", { ...tenantFilter, calibrationStatus: "OVERDUE" }),
    safeCount("DocumentControl", combined),
    safeCount("DocumentControl", { ...tenantFilter, reviewDueDate: { $lte: new Date() }, status: "EFFECTIVE" }),
  ]);

  return {
    period: { start: periodStart, end: periodEnd },
    audit: {
      total: totalAudits,
      closed: closedAudits,
      closureRate: totalAudits ? Math.round((closedAudits / totalAudits) * 100) : 0,
    },
    capa: {
      total: totalCapas,
      closed: closedCapas,
      overdue: overdueCapas,
      onTimeRate: totalCapas ? Math.round((closedCapas / totalCapas) * 100) : 0,
    },
    deviation: { total: totalDeviations, critical: criticalDeviations },
    complaint: { total: totalComplaints, open: openComplaints },
    training: {
      total: totalTraining,
      completed: completedTraining,
      overdue: overdueTraining,
      complianceRate: totalTraining ? Math.round((completedTraining / totalTraining) * 100) : 0,
    },
    changeControl: { total: totalChangeControls, open: openChangeControls },
    equipment: { calibrationOverdue: equipmentOverdue },
    document: { total: totalDocuments, pendingReview: documentsForReview },
  };
}

// ── 5. Deviation → auto-create CAPA ──────────────────────────────────────────
export async function createCapaFromDeviation(deviation, userId) {
  const { default: mongoose } = await import("mongoose");
  let CapaV2;
  try { CapaV2 = mongoose.model("CapaV2"); } catch { return null; }

  const capa = await CapaV2.create({
    tenantId: deviation.tenantId,
    title: `CAPA from ${deviation.deviationNumber}: ${deviation.title}`,
    description: `Auto-generated CAPA from deviation ${deviation.deviationNumber}.\n\nRoot cause: ${deviation.investigation?.rootCause || "Pending investigation"}`,
    sourceType: "DEVIATION",
    sourceRef: { id: deviation._id, collection: "deviations", label: deviation.deviationNumber },
    severity: deviation.classification === "CRITICAL" ? "CRITICAL" : deviation.classification === "MAJOR" ? "HIGH" : "MEDIUM",
    status: "CAPA_OPEN",
    createdBy: userId,
  });

  return capa;
}

// ── 6. Complaint → regulatory flag check ─────────────────────────────────────
export function assessRegulatoryReportingRequired(complaint) {
  const flags = [];
  if (complaint.severity === "CRITICAL") flags.push("CRITICAL_SEVERITY");
  if (complaint.isMedicalDeviceReport) flags.push("MDR_APPLICABLE");
  if (complaint.complaintType === "SAFETY") flags.push("SAFETY_RELATED");
  if (complaint.source === "REGULATOR") flags.push("REGULATOR_ORIGINATED");
  if (complaint.source === "PATIENT") flags.push("PATIENT_REPORT");

  return {
    requiresReporting: flags.length > 0,
    flags,
    recommendedDeadlineDays: flags.includes("CRITICAL_SEVERITY") || flags.includes("MDR_APPLICABLE") ? 5 : 30,
    regulatoryBodies: complaint.isMedicalDeviceReport ? ["FDA_MEDWATCH", "EU_VIGILANCE"] : flags.includes("SAFETY_RELATED") ? ["FDA_MEDWATCH"] : [],
  };
}

// ── 7. Supplier scorecard ────────────────────────────────────────────────────
export async function calculateSupplierScorecard(supplierId, tenantId) {
  const { default: mongoose } = await import("mongoose");
  const oneYearAgo = new Date(Date.now() - 365 * 86400000);
  const dateFilter = { createdAt: { $gte: oneYearAgo } };

  const safeCount = async (modelName, filter) => {
    try { return await mongoose.model(modelName).countDocuments(filter); } catch { return 0; }
  };

  const [
    totalAudits, satisfactoryAudits,
    totalCapas, onTimeCapas,
    totalDeviations, criticalDeviations,
    totalComplaints,
  ] = await Promise.all([
    safeCount("audit-requests-masters", { supplier_id: supplierId, ...dateFilter, high_status: 5 }),
    safeCount("audit-requests-masters", { supplier_id: supplierId, ...dateFilter, facilityOutcome: "SATISFACTORY" }),
    safeCount("CapaV2", { "sourceRef.id": supplierId, ...dateFilter }),
    safeCount("CapaV2", { "sourceRef.id": supplierId, ...dateFilter, status: "CLOSED_EFFECTIVE" }),
    safeCount("Deviation", { supplierId, ...dateFilter }),
    safeCount("Deviation", { supplierId, ...dateFilter, classification: "CRITICAL" }),
    safeCount("Complaint", { supplierId, ...dateFilter }),
  ]);

  const auditScore = totalAudits ? (satisfactoryAudits / totalAudits) * 100 : 100;
  const capaScore = totalCapas ? (onTimeCapas / totalCapas) * 100 : 100;
  const deviationPenalty = criticalDeviations * 10 + (totalDeviations - criticalDeviations) * 2;
  const complaintPenalty = totalComplaints * 5;

  const rawScore = Math.max(0, (auditScore * 0.4 + capaScore * 0.3 + 100 * 0.3) - deviationPenalty - complaintPenalty);
  const overallScore = Math.round(Math.min(100, rawScore));

  return {
    supplierId,
    period: "12 months",
    overallScore,
    band: overallScore >= 80 ? "LOW_RISK" : overallScore >= 60 ? "MEDIUM_RISK" : "HIGH_RISK",
    breakdown: {
      auditScore: Math.round(auditScore),
      capaScore: Math.round(capaScore),
      deviationPenalty,
      complaintPenalty,
    },
    counts: { totalAudits, satisfactoryAudits, totalCapas, onTimeCapas, totalDeviations, criticalDeviations, totalComplaints },
  };
}

// ── 8. Equipment PM overdue check ────────────────────────────────────────────
export async function getEquipmentAlerts(tenantId) {
  const { default: mongoose } = await import("mongoose");
  let Equipment;
  try { Equipment = mongoose.model("Equipment"); } catch { return { calibrationOverdue: [], calibrationDueSoon: [] }; }

  const now = new Date();
  const soon = new Date(Date.now() + 14 * 86400000);
  const filter = tenantId ? { tenantId } : {};

  const [overdue, dueSoon] = await Promise.all([
    Equipment.find({ ...filter, requiresCalibration: true, nextCalibrationDue: { $lt: now }, status: { $ne: "RETIRED" } })
      .select("equipmentNumber name nextCalibrationDue location").lean(),
    Equipment.find({ ...filter, requiresCalibration: true, nextCalibrationDue: { $gte: now, $lte: soon }, status: { $ne: "RETIRED" } })
      .select("equipmentNumber name nextCalibrationDue location").lean(),
  ]);

  return { calibrationOverdue: overdue, calibrationDueSoon: dueSoon };
}
