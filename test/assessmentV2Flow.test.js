import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { Assessment } from "../src/models/assessmentModel.js";
import { QuestionnaireArtifact } from "../src/models/questionnaireArtifactModel.js";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import {
  createAssessment,
  getAssessment,
  updatePhase,
} from "../src/controllers/v2/assessmentController.js";
import {
  createPreAuditQuestionnaire,
  createFullQuestionnaire,
  respondQuestionnaire,
} from "../src/controllers/v2/questionnaireController.js";

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
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenant = await Tenant.create({ name: "tenant-a", displayName: "Tenant A", type: "INTERNAL" });
  const buyer = await User.create({ email: "buyer@test.com", password: "pass", role: "buyer", tenant_id: tenant._id });
  const auditor = await User.create({ email: "auditor@test.com", password: "pass", role: "auditor", tenant_id: tenant._id });
  const supplier = await User.create({ email: "supplier@test.com", password: "pass", role: "supplier", tenant_id: tenant._id });
  const supplierUser = await User.create({
    email: "supplier.user@test.com",
    password: "pass",
    role: "supplierUser",
    tenant_id: tenant._id,
    invitedBy: supplier._id,
  });

  const createReq = {
    user: buyer,
    tenantId: tenant._id,
    body: {
      modules: ["cGMP"],
      assignedAuditors: [{ userId: auditor._id.toString(), role: "LEAD" }],
      scope: {
        supplierId: supplier._id.toString(),
        buyerId: buyer._id.toString(),
      },
    },
  };
  const createRes = mockRes();
  await createAssessment(createReq, createRes);
  assert.equal(createRes.statusCode, 201);
  const assessmentId = createRes.body.data._id;

  const phaseRes = mockRes();
  await updatePhase(
    {
      user: auditor,
      tenantId: tenant._id,
      params: { id: assessmentId },
      body: { phaseKey: "SCOPE_AGENDA", status: "IN_PROGRESS" },
    },
    phaseRes
  );
  assert.equal(phaseRes.statusCode, 400);

  const paqRes = mockRes();
  await createPreAuditQuestionnaire(
    { user: auditor, tenantId: tenant._id, params: { id: assessmentId }, body: {} },
    paqRes
  );
  assert.equal(paqRes.statusCode, 201);
  const paq = await QuestionnaireArtifact.findOne({ assessmentId, kind: "PRE_AUDIT" }).lean();
  assert.ok(paq);

  const phaseRes2 = mockRes();
  await updatePhase(
    {
      user: auditor,
      tenantId: tenant._id,
      params: { id: assessmentId },
      body: { phaseKey: "SCOPE_AGENDA", status: "IN_PROGRESS" },
    },
    phaseRes2
  );
  assert.equal(phaseRes2.statusCode, 200);

  const respondRes = mockRes();
  await respondQuestionnaire(
    {
      user: supplierUser,
      tenantId: tenant._id,
      params: { qid: paq._id },
      body: { responses: [{ questionId: "CGMP_PQA_PROFILE", value: "Uploaded" }], submit: true },
    },
    respondRes
  );
  assert.equal(respondRes.statusCode, 200);

  await Template.create({ templateId: 1, name: "Full Template" });
  await TemplateQuestions.create({
    question: "Is SOP current?",
    categoryName: "General",
    templateId: 1,
    categoryId: new mongoose.Types.ObjectId(),
  });

  const fullRes = mockRes();
  await createFullQuestionnaire(
    { user: auditor, tenantId: tenant._id, params: { id: assessmentId }, body: { templateId: 1 } },
    fullRes
  );
  assert.equal(fullRes.statusCode, 201);

  const getRes = mockRes();
  await getAssessment({ user: buyer, tenantId: tenant._id, params: { id: assessmentId } }, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.ok(getRes.body.data.phases?.length);

  const outsider = await User.create({ email: "outsider@test.com", password: "pass", role: "buyer", tenant_id: tenant._id });
  const denyRes = mockRes();
  await getAssessment({ user: outsider, tenantId: tenant._id, params: { id: assessmentId } }, denyRes);
  assert.equal(denyRes.statusCode, 403);

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
