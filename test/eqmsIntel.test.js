import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { ComplianceEventCanonical } from "../src/models/complianceEventCanonicalModel.js";
import { syncInternalCapasFromSystem } from "../src/services/eqms/eqmsSyncService.js";
import {
  computeCapaRiskScore,
  recalculateCAPARiskIndicator,
} from "../src/services/eqms/riskScoringService.js";
import { buildDynamicQuestionnaire } from "../src/services/eqms/dynamicQuestionnaireEngine.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenant = await Tenant.create({
    name: "eqms-test-tenant",
    displayName: "EQMS Test Tenant",
    type: "BUYER",
    status: "ACTIVE",
  });

  const supplier = await User.create({
    email: "supplier@eqms.test",
    password: "x",
    role: "supplier",
    tenant_id: tenant._id,
    status: "ACTIVE",
    isEmailVerified: true,
  });

  const now = new Date();
  const pastDue = new Date(now.getTime() - 5 * 86400000);

  await ComplianceEventCanonical.insertMany([
    {
      tenantId: tenant._id,
      providerKey: "trackwise",
      eventType: "CAPA",
      eventId: "TW-CAPA-001",
      supplierId: supplier._id,
      severity: "Critical",
      status: "Open",
      openedDate: new Date(now.getTime() - 15 * 86400000),
      dueDate: pastDue,
      metadata: { riskCategory: "contamination" },
    },
    {
      tenantId: tenant._id,
      providerKey: "trackwise",
      eventType: "CAPA",
      eventId: "TW-CAPA-002",
      supplierId: supplier._id,
      severity: "Major",
      status: "Open",
      openedDate: new Date(now.getTime() - 12 * 86400000),
      dueDate: new Date(now.getTime() + 3 * 86400000),
      metadata: { riskCategory: "training" },
    },
    {
      tenantId: tenant._id,
      providerKey: "trackwise",
      eventType: "DEVIATION",
      eventId: "TW-DEV-001",
      supplierId: supplier._id,
      severity: "Major",
      status: "Open",
      openedDate: new Date(now.getTime() - 8 * 86400000),
      metadata: { title: "Repeat process deviation" },
    },
  ]);

  const syncResult = await syncInternalCapasFromSystem({
    tenantId: tenant._id,
    systemKey: "trackwise",
    supplierId: supplier._id,
  });
  assert.strictEqual(syncResult.fetched.capaRecords, 2);

  const score = computeCapaRiskScore({
    records: [
      { isOpen: true, severity: "Critical", riskCategory: "contamination", dueDate: pastDue },
      { isOpen: true, severity: "Major", riskCategory: "contamination", dueDate: pastDue },
    ],
  });
  assert.ok(score.riskScore >= 75);
  assert.strictEqual(score.riskLevel, "HIGH");
  assert.strictEqual(score.recurringCAPAFlag, true);
  assert.strictEqual(score.overdueCAPAFlag, true);

  const indicator = await recalculateCAPARiskIndicator({
    tenantId: tenant._id,
    supplierId: supplier._id,
  });
  assert.ok(indicator.riskScore >= 45);
  assert.ok(["MEDIUM", "HIGH", "CRITICAL"].includes(indicator.riskLevel));

  const recommendations = await buildDynamicQuestionnaire({
    tenantId: tenant._id,
    supplierId: supplier._id,
  });
  const codes = recommendations.recommendations.map((item) => item.code);
  assert.ok(codes.includes("EQMS_CONTAMINATION_CONTROL"));
  assert.ok(codes.includes("EQMS_TRAINING_COMPLIANCE"));
  assert.ok(codes.includes("EQMS_CAPA_GOVERNANCE"));

  await mongoose.disconnect();
  await mongoServer.stop();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
