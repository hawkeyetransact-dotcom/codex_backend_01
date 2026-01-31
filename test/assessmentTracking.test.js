import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AssessmentType } from "../src/models/assessmentTypeModel.js";
import { StatusDefinition } from "../src/models/statusDefinitionModel.js";
import { StatusHistory } from "../src/models/statusHistoryModel.js";
import { StatusTracker } from "../src/models/statusTrackerModel.js";
import { PhaseTracker } from "../src/models/phaseTrackerModel.js";
import { AuditEvent } from "../src/models/auditEventModel.js";
import { PHASE_DEFINITIONS } from "../src/constants/assessmentTracking.js";
import {
  ensurePhaseTracker,
  ensureStatusTrackersForPhase,
  updatePhaseTracker,
} from "../src/services/assessmentTrackingService.js";
import { updateStatus } from "../src/controllers/trackingController.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenantId = new mongoose.Types.ObjectId().toString();
  const assessmentType = await AssessmentType.create({
    tenantId,
    key: "PHARMA_API_CGMP_ICHQ7",
    name: "Pharma API cGMP (ICH Q7)",
    phases: PHASE_DEFINITIONS,
    workflowType: "AUDIT",
    defaultGranularity: "STANDARD",
  });

  await StatusDefinition.create({
    tenantId,
    assessmentTypeId: assessmentType._id,
    phaseKey: "INITIATED",
    statusCode: "RFQ_CREATED",
    name: "RFQ created",
    order: 10,
    defaultResponsibleRole: "buyer",
  });
  await StatusDefinition.create({
    tenantId,
    assessmentTypeId: assessmentType._id,
    phaseKey: "PREP",
    statusCode: "PREP_INVITE_SENT",
    name: "Prep invite sent",
    order: 10,
    defaultResponsibleRole: "auditor",
  });

  const audit = await AuditRequestMaster.create({
    supplier_id: new mongoose.Types.ObjectId(),
    auditor_id: new mongoose.Types.ObjectId(),
    create_by_buyer_id: new mongoose.Types.ObjectId(),
    supplier_product_id: new mongoose.Types.ObjectId(),
    site_id: new mongoose.Types.ObjectId(),
    complianceDate: new Date(),
    tenantOrgId: tenantId,
  });

  const tracker = await ensurePhaseTracker({ audit, assessmentType, tenantId });
  assert.ok(tracker);

  const initiatedStatuses = await ensureStatusTrackersForPhase({
    audit,
    assessmentType,
    tenantId,
    phaseKey: "INITIATED",
  });
  assert.equal(initiatedStatuses.length, 1);

  await updatePhaseTracker({ tracker, toPhaseKey: "PREP" });
  const prepStatuses = await ensureStatusTrackersForPhase({
    audit,
    assessmentType,
    tenantId,
    phaseKey: "PREP",
  });
  assert.equal(prepStatuses.length, 1);

  const req = {
    params: { auditId: audit._id.toString() },
    body: { statusCode: "RFQ_CREATED", toStatus: "COMPLETED", phaseKey: "INITIATED" },
    tenantId,
    user: { _id: new mongoose.Types.ObjectId(), role: "auditor" },
    ip: "127.0.0.1",
    get: () => "test-agent",
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await updateStatus(req, res);
  assert.equal(res.statusCode, 200);

  const updated = await StatusTracker.findOne({
    tenantId,
    workflowEntityId: audit._id,
    phaseKey: "INITIATED",
    statusCode: "RFQ_CREATED",
  }).lean();
  assert.equal(updated?.status, "COMPLETED");

  const historyCount = await StatusHistory.countDocuments({
    tenantId,
    workflowEntityId: audit._id,
    statusCode: "RFQ_CREATED",
  });
  assert.equal(historyCount, 1);

  const eventCount = await AuditEvent.countDocuments({
    tenantId,
    auditId: audit._id,
    action: "STATUS_UPDATED",
  });
  assert.equal(eventCount, 1);

  const phaseTracker = await PhaseTracker.findOne({
    tenantId,
    workflowEntityId: audit._id,
  }).lean();
  assert.ok(phaseTracker);

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
