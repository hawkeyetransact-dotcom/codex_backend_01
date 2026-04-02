import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { User } from "../src/models/userModel.js";
import {
  derivePhaseStateFromLegacy,
  normalizePhaseState,
  resolvePhaseOrder,
} from "../src/services/auditPhaseService.js";
import {
  bootstrapAuditWorkflowState,
  isSupplierInitiationAcknowledged,
  normalizeAuditTenantScopeId,
  syncAuditMilestonesFromStatus,
} from "../src/services/auditWorkflowSyncService.js";

const dryRun = !process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
const phaseOrder = resolvePhaseOrder();

const shouldReplacePhaseState = (audit, currentState, derivedState) => {
  const rawTrackStatus = String(audit?.trackStatus || "").toLowerCase();
  if (!audit?.isArchived && rawTrackStatus.includes("archiv")) return true;
  if (!audit?.phaseState) return true;
  const currentIdx = phaseOrder[currentState?.currentPhase] ?? 0;
  const derivedIdx = phaseOrder[derivedState?.currentPhase] ?? 0;

  if (!audit?.auditor_id && derivedState?.currentPhase === "INITIATED" && currentIdx > derivedIdx) {
    return true;
  }

  return derivedIdx > currentIdx;
};

const deriveTrackStatus = (audit) => {
  const raw = String(audit?.trackStatus || "").trim();
  if (audit?.isArchived) return raw || "Archived";

  const supplierDecision = String(audit?.supplierDecision || "").toUpperCase();
  const auditorDecision = String(audit?.auditorDecision || "").toUpperCase();
  const qStatus = String(audit?.questionnaireStatus || "").toLowerCase();
  const numeric = Number(audit?.high_status);

  if (supplierDecision === "PROPOSED") return "Supplier proposed schedule";
  if (supplierDecision === "ACCEPTED") return "Supplier accepted intimation";
  if (supplierDecision === "REJECTED") return "Supplier rejected intimation";
  if (auditorDecision === "REJECTED") return "Auditor rejected";
  if ((Number.isFinite(numeric) && numeric >= 5) || qStatus === "auditor_submitted" || qStatus === "review_completed") {
    return "Closed";
  }
  if (qStatus === "followup_requested") return "Supplier follow up open";
  if (qStatus === "followup_submitted") return "Supplier follow up submitted";
  if (qStatus === "supplier_submitted") return "Response Complete";
  if (qStatus === "supplier_draft") return "Response In Progress";
  if (qStatus === "sent_to_supplier") return "Request sent to Supplier";
  if (qStatus === "in_progress") return "Questionnaire in progress";
  if (qStatus === "request_received" && audit?.auditor_id) return "Auditor selected";
  if (qStatus === "request_received") return "Request Created (Incomplete)";
  return raw || "Request Created (Incomplete)";
};

const run = async () => {
  await connectDatabase();
  const query = {};
  const audits = await AuditRequestMaster.find(query).sort({ _id: 1 }).limit(limit || 0);
  const buyerIds = [
    ...new Set(
      audits
        .map((audit) => String(audit?.create_by_buyer_id || "").trim())
        .filter(Boolean)
    ),
  ];
  const buyers = await User.find({ _id: { $in: buyerIds } })
    .select({ _id: 1, tenant_id: 1, email: 1 })
    .lean();
  const buyerMap = new Map(buyers.map((buyer) => [String(buyer._id), buyer]));

  const summary = {
    processed: 0,
    updatedTenantScope: 0,
    updatedPhaseState: 0,
    updatedNextAuditOn: 0,
    updatedTrackStatus: 0,
    updatedSupplierVisibility: 0,
    syncedWorkflow: 0,
    errors: 0,
  };

  console.log("[repair_audit_visibility_and_status] starting", {
    dryRun,
    totalAudits: audits.length,
  });

  for (const audit of audits) {
    summary.processed += 1;
    try {
      const buyer = buyerMap.get(String(audit.create_by_buyer_id || ""));
      const creatorTenantId = normalizeAuditTenantScopeId(buyer?.tenant_id || null);
      const currentTenantId = normalizeAuditTenantScopeId(audit.tenantOrgId || null);

      if (creatorTenantId && creatorTenantId !== currentTenantId) {
        audit.tenantOrgId = creatorTenantId;
        summary.updatedTenantScope += 1;
      }

      const currentState = normalizePhaseState(audit.phaseState || null);
      const derivedState = normalizePhaseState(derivePhaseStateFromLegacy(audit));
      if (shouldReplacePhaseState(audit, currentState, derivedState)) {
        audit.phaseState = derivedState;
        summary.updatedPhaseState += 1;
      }

      if (!audit.isArchived && /archiv/i.test(String(audit.trackStatus || ""))) {
        const normalizedTrackStatus = deriveTrackStatus(audit);
        if (normalizedTrackStatus !== String(audit.trackStatus || "")) {
          audit.trackStatus = normalizedTrackStatus;
          summary.updatedTrackStatus += 1;
        }
      }

      const supplierDecision = String(audit.supplierDecision || "").toUpperCase();
      const acknowledged = isSupplierInitiationAcknowledged(audit);
      if (!audit.auditor_id && acknowledged && String(audit.nextAuditOn || "").toLowerCase() !== "buyer") {
        audit.nextAuditOn = "buyer";
        summary.updatedNextAuditOn += 1;
      }

      if (supplierDecision === "ACCEPTED" && /audit intimation accepted/i.test(String(audit.trackStatus || ""))) {
        audit.trackStatus = "Supplier accepted intimation";
        summary.updatedTrackStatus += 1;
      }
      if (supplierDecision === "REJECTED" && /audit intimation rejected/i.test(String(audit.trackStatus || ""))) {
        audit.trackStatus = "Supplier rejected intimation";
        summary.updatedTrackStatus += 1;
      }

      if (
        !audit.supplierVisible &&
        (
          acknowledged ||
          ["ACCEPTED", "PROPOSED", "REJECTED"].includes(supplierDecision) ||
          /intimation|request sent to supplier|schedule confirmed/i.test(String(audit.trackStatus || ""))
        )
      ) {
        audit.supplierVisible = true;
        audit.supplierVisibleAt = audit.supplierVisibleAt || new Date();
        summary.updatedSupplierVisibility += 1;
      }

      if (!dryRun) {
        if (audit.isModified()) {
          await audit.save();
        }
        await bootstrapAuditWorkflowState({ audit });
        await syncAuditMilestonesFromStatus({
          audit,
          trackStatus: audit.trackStatus,
          questionnaireStatus: audit.questionnaireStatus,
          nextAuditOn: audit.nextAuditOn,
        });
        summary.syncedWorkflow += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error(
        "[repair_audit_visibility_and_status] failed",
        String(audit?._id || ""),
        error?.message || error
      );
    }
  }

  console.log("[repair_audit_visibility_and_status] complete", summary);
  await mongoose.connection.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
