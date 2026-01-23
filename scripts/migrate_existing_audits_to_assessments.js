import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AuditCycleTemplate } from "../src/models/auditCycleTemplateModel.js";
import { Assessment } from "../src/models/assessmentModel.js";
import { User } from "../src/models/userModel.js";
import { buildAssessmentPhases } from "../src/modules/auditEngine/assessmentBuilder.js";
import { AUDIT_PHASE_KEYS } from "../src/modules/auditEngine/constants.js";

const argValue = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dryRun = process.argv.includes("--dryRun");
const limit = toNumber(argValue("--limit", undefined), undefined);
const batchSize = toNumber(argValue("--batchSize", 200), 200);
const startAfter = argValue("--startAfter", undefined);

const normalizeText = (value) => String(value || "").toLowerCase();

const isCompleteStatus = (audit) => {
  const raw = normalizeText(audit?.trackStatus || audit?.high_status);
  return raw.includes("complete") || raw.includes("closed");
};

const mapCurrentPhaseKey = (audit) => {
  const qStatus = normalizeText(audit?.questionnaireStatus);
  const track = normalizeText(audit?.trackStatus);
  if (qStatus.includes("followup")) return AUDIT_PHASE_KEYS.FOLLOWUP_CAPA;
  if (qStatus.includes("auditor_submitted") || qStatus.includes("review_completed")) return AUDIT_PHASE_KEYS.REPORTING;
  if (qStatus.includes("supplier_submitted")) return AUDIT_PHASE_KEYS.REPORTING;
  if (qStatus.includes("sent_to_supplier") || qStatus.includes("supplier_draft")) return AUDIT_PHASE_KEYS.EXECUTION;
  if (track.includes("schedule")) return AUDIT_PHASE_KEYS.SCHEDULING;
  if (track.includes("scope") || track.includes("agenda")) return AUDIT_PHASE_KEYS.SCOPE_AGENDA;
  return AUDIT_PHASE_KEYS.PREP;
};

const resolveTenantId = async (audit) => {
  if (mongoose.Types.ObjectId.isValid(audit?.tenantOrgId)) return new mongoose.Types.ObjectId(audit.tenantOrgId);
  const buyer = audit?.create_by_buyer_id ? await User.findById(audit.create_by_buyer_id).select("tenant_id").lean() : null;
  if (buyer?.tenant_id) return buyer.tenant_id;
  const supplier = audit?.supplier_id ? await User.findById(audit.supplier_id).select("tenant_id").lean() : null;
  return supplier?.tenant_id || null;
};

const markPhaseStatuses = (phases, currentPhaseKey) => {
  const orderMap = new Map(phases.map((p, idx) => [p.key, idx]));
  const currentIdx = orderMap.get(currentPhaseKey) ?? 0;
  return phases.map((phase, idx) => {
    if (idx < currentIdx) {
      phase.status = "DONE";
      phase.endDate = new Date();
      phase.milestones = (phase.milestones || []).map((m) => ({
        ...m,
        status: "DONE",
        completedAt: m.completedAt || new Date(),
      }));
    } else if (idx === currentIdx) {
      phase.status = "IN_PROGRESS";
      phase.startDate = phase.startDate || new Date();
    }
    return phase;
  });
};

const run = async () => {
  await connectDatabase();
  console.log("Starting migrate_existing_audits_to_assessments", { dryRun, limit, batchSize, startAfter });

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;
  let lastId = startAfter;

  while (true) {
    if (limit && processed >= limit) break;
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const audits = await AuditRequestMaster.find(query).sort({ _id: 1 }).limit(batchSize).lean();
    if (!audits.length) break;

    for (const audit of audits) {
      if (limit && processed >= limit) break;
      processed += 1;
      lastId = String(audit._id);

      const existing = await Assessment.findOne({ "legacyRefs.auditRequestId": audit._id }).lean();
      if (existing) {
        skipped += 1;
        continue;
      }

      const tenantId = await resolveTenantId(audit);
      if (!tenantId) {
        console.warn("Skipping audit without tenant", audit._id);
        skipped += 1;
        continue;
      }

      const templates = await AuditCycleTemplate.find({ tenantId, module: "cGMP" }).lean();
      const phases = buildAssessmentPhases({
        modules: ["cGMP"],
        templates,
        baseDate: audit.createdAt || new Date(),
      });

      const currentPhaseKey = mapCurrentPhaseKey(audit);
      const normalizedPhases = markPhaseStatuses(phases, currentPhaseKey);

      const assignedAuditors = audit?.assignedAuditors?.length
        ? audit.assignedAuditors.map((a) => ({
            userId: a.auditorProfileId || audit.auditor_id,
            role: a.role || "LEAD",
            assignedAt: a.assignedAt || audit.createdAt || new Date(),
            assignedBy: a.assignedBy,
          }))
        : [{ userId: audit.auditor_id, role: "LEAD", assignedAt: audit.createdAt || new Date() }];

      const participants = [
        audit.supplier_id ? { userId: audit.supplier_id, role: "supplier" } : null,
        audit.create_by_buyer_id ? { userId: audit.create_by_buyer_id, role: "buyer" } : null,
      ].filter(Boolean);

      const payload = {
        tenantId,
        modules: ["cGMP"],
        type: "External",
        scope: {
          siteId: audit.site_id,
          productId: audit.supplier_product_id,
          supplierId: audit.supplier_id,
          buyerId: audit.create_by_buyer_id,
          description: audit.requestName || "",
        },
        currentPhaseKey,
        phases: normalizedPhases,
        status: isCompleteStatus(audit) ? "COMPLETED" : "ACTIVE",
        assignedAuditors,
        participants,
        createdBy: audit.create_by_buyer_id || audit.auditor_id || audit.supplier_id,
        legacyRefs: {
          auditRequestId: audit._id,
          tenantOrgId: audit.tenantOrgId || null,
          hawkeyeRequestId: audit.hawkeyeRequestId || null,
          supplierRequestId: audit.supplierRequestId || null,
          internalRequestId: audit.internalRequestId || null,
        },
      };

      if (!dryRun) {
        await Assessment.create(payload);
      }
      created += 1;
    }
  }

  console.log("Migration complete", { processed, created, skipped, errors, lastId });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
