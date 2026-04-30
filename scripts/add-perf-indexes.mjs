/**
 * add-perf-indexes.mjs
 *
 * Adds compound indexes that make the audit summary, detail, artifacts and
 * tracking pages fast. Idempotent — safe to re-run; createIndex is a no-op
 * if the same index already exists.
 *
 * Usage: node scripts/add-perf-indexes.mjs
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

// Collection names use kebab-case, not Mongoose's default lower-pluralized form.
const indexes = [
  // AuditRequestMaster — buyer + auditor + supplier list filters.
  // Both naming conventions exist in this DB; index both to be safe.
  { collection: "audit-requests-masters", spec: { auditor_id: 1, tenantOrgId: 1, isArchived: 1 }, name: "idx_auditor_tenant_archived" },
  { collection: "audit-requests-masters", spec: { supplier_id: 1, tenantOrgId: 1, isArchived: 1 }, name: "idx_supplier_tenant_archived" },
  { collection: "audit-requests-masters", spec: { create_by_buyer_id: 1, tenantOrgId: 1, isArchived: 1 }, name: "idx_buyer_tenant_archived" },
  { collection: "audit-requests-masters", spec: { "assignedAuditors.auditorProfileId": 1, tenantOrgId: 1 }, name: "idx_assigned_profile_tenant" },

  // AuditArtifact — list-by-audit + phase
  { collection: "audit-artifacts", spec: { auditId: 1, phaseKey: 1, updatedAt: -1 }, name: "idx_audit_phase_updated" },
  { collection: "audit-artifacts", spec: { auditId: 1, artifactType: 1 }, name: "idx_audit_type" },

  // PhaseTracker — single-doc lookup per audit
  { collection: "phase-trackers", spec: { tenantId: 1, workflowEntityId: 1, workflowEntityType: 1 }, name: "idx_tenant_entity_type" },

  // StatusTracker — by-phase lookup on tracking tab
  { collection: "status-trackers", spec: { tenantId: 1, workflowEntityId: 1, phaseKey: 1 }, name: "idx_tenant_entity_phase" },

  // StatusDefinition — phase + tenant scope
  { collection: "status-definitions", spec: { tenantId: 1, assessmentTypeId: 1, phaseKey: 1, isActive: 1 }, name: "idx_tenant_assessment_phase_active" },
];

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}\n`);

let created = 0, existed = 0, failed = 0;
for (const ix of indexes) {
  const coll = mongoose.connection.db.collection(ix.collection);
  try {
    const existing = await coll.indexes();
    const exists = existing.find((i) => i.name === ix.name);
    if (exists) {
      console.log(`  [exists]  ${ix.collection.padEnd(24)} ${ix.name}`);
      existed++;
      continue;
    }
    await coll.createIndex(ix.spec, { name: ix.name, background: true });
    console.log(`  [CREATED] ${ix.collection.padEnd(24)} ${ix.name} ${JSON.stringify(ix.spec)}`);
    created++;
  } catch (e) {
    console.log(`  [FAIL]    ${ix.collection.padEnd(24)} ${ix.name} -- ${e.message}`);
    failed++;
  }
}

console.log(`\nSummary: ${created} created · ${existed} pre-existing · ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
