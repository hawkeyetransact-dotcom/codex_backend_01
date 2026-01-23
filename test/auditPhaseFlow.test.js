import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const run = async () => {
  process.env.ENABLE_PREP_PHASE = "true";

  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const { default: Tenant } = await import("../src/models/tenantModel.js");
  const { User } = await import("../src/models/userModel.js");
  const { AuditRequestMaster } = await import("../src/models/auditRequestsMasterModel.js");
  const {
    getAuditPhases,
    startPrepPhase,
    createAuditArtifact,
    submitAuditArtifact,
    completePrepPhase,
  } = await import("../src/controllers/auditPhaseController.js");

  const tenant = await Tenant.create({ name: "tenant-a", displayName: "Tenant A", type: "INTERNAL" });
  const buyer = await User.create({ email: "buyer@test.com", password: "pass", role: "buyer", tenant_id: tenant._id });
  const auditor = await User.create({ email: "auditor@test.com", password: "pass", role: "auditor", tenant_id: tenant._id });
  const supplier = await User.create({ email: "supplier@test.com", password: "pass", role: "supplier", tenant_id: tenant._id });

  const audit = await AuditRequestMaster.create({
    tenantOrgId: String(tenant._id),
    supplier_id: supplier._id,
    auditor_id: auditor._id,
    create_by_buyer_id: buyer._id,
    supplier_product_id: new mongoose.Types.ObjectId(),
    site_id: new mongoose.Types.ObjectId(),
    complianceDate: new Date(),
    trackStatus: "Request Received",
    questionnaireStatus: "request_received",
  });

  const phaseRes = mockRes();
  await getAuditPhases(
    { user: auditor, tenantId: tenant._id, params: { auditId: audit._id.toString() }, query: {} },
    phaseRes
  );
  assert.equal(phaseRes.statusCode, 200);
  assert.equal(phaseRes.body.data.phaseState.currentPhase, "INITIATED");

  const prepRes = mockRes();
  await startPrepPhase(
    { user: auditor, tenantId: tenant._id, params: { auditId: audit._id.toString() }, body: {} },
    prepRes
  );
  assert.equal(prepRes.statusCode, 200);
  assert.equal(prepRes.body.data.phaseState.currentPhase, "PREP");

  const createReq = (artifactType) => ({
    user: auditor,
    tenantId: tenant._id,
    params: { auditId: audit._id.toString() },
    body: { phaseKey: "PREP", artifactType },
  });
  await createAuditArtifact(createReq("PRE_AUDIT_QUESTIONNAIRE"), mockRes());
  await createAuditArtifact(createReq("DRL"), mockRes());
  await createAuditArtifact(createReq("SCOPE"), mockRes());

  const artifacts = await (await import("../src/models/auditArtifactModel.js")).AuditArtifact.find({
    auditId: audit._id,
  }).lean();
  const byType = new Map(artifacts.map((a) => [a.artifactType, a]));

  const submitReq = (user, artifactId, data) => ({
    user,
    tenantId: tenant._id,
    params: { auditId: audit._id.toString(), artifactId },
    body: { submit: true, data },
  });
  await submitAuditArtifact(submitReq(supplier, byType.get("PRE_AUDIT_QUESTIONNAIRE")._id), mockRes());
  await submitAuditArtifact(submitReq(supplier, byType.get("DRL")._id, { documents: ["doc-1"] }), mockRes());
  await submitAuditArtifact(submitReq(auditor, byType.get("SCOPE")._id, { confirmed: true }), mockRes());

  const completeRes = mockRes();
  await completePrepPhase(
    { user: auditor, tenantId: tenant._id, params: { auditId: audit._id.toString() }, body: {} },
    completeRes
  );
  assert.equal(completeRes.statusCode, 200);
  assert.equal(completeRes.body.data.phaseState.phases.PREP.status, "COMPLETED");
  assert.equal(completeRes.body.data.readiness.score, 100);

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
