import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import {
  createWorkflowDefinition,
  publishWorkflowDefinition,
} from "../src/controllers/workflowDefinitionController.js";
import {
  createWorkflowInstance,
  getWorkflowInstance,
} from "../src/controllers/workflowInstanceController.js";
import {
  completeWorkflowTask,
  listWorkflowTasks,
} from "../src/controllers/workflowTaskController.js";

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

  const tenant = await Tenant.create({
    name: "wf-e2e-tenant",
    displayName: "Workflow E2E Tenant",
    type: "INTERNAL",
  });
  const admin = await User.create({
    email: "admin.workflow@test.com",
    password: "pass",
    role: "tenant_admin",
    adminScope: "TENANT",
    tenant_id: tenant._id,
  });

  const createReq = {
    tenantId: tenant._id,
    user: admin,
    body: {
      key: "pharma_audit.e2e_definition",
      name: "Workflow E2E Definition",
      packKey: "pharma_audit",
      description: "Controller integration test",
    },
  };
  const createRes = mockRes();
  await createWorkflowDefinition(createReq, createRes);
  assert.equal(createRes.statusCode, 201);
  const definitionId = createRes.body.data._id;

  const publishReq = {
    tenantId: tenant._id,
    user: admin,
    params: { id: definitionId.toString() },
    body: {
      definition: {
        key: "pharma_audit.e2e_definition",
        name: "Workflow E2E Definition",
        packKey: "pharma_audit",
        version: 1,
        startNodeId: "start",
        nodes: [
          { id: "start", type: "start", name: "Start" },
          {
            id: "review",
            type: "human_task",
            name: "Review",
            role: "tenant_admin",
            task: { title: "Review and complete", dueInHours: 1 },
          },
          { id: "end", type: "end", name: "End" },
        ],
        edges: [
          { from: "start", to: "review", on: "node.completed", priority: 10 },
          { from: "review", to: "end", on: "task.completed", priority: 10 },
        ],
      },
    },
  };
  const publishRes = mockRes();
  await publishWorkflowDefinition(publishReq, publishRes);
  assert.equal(publishRes.statusCode, 201);

  const startReq = {
    tenantId: tenant._id,
    user: admin,
    body: {
      definitionId: definitionId.toString(),
      context: { source: "e2e_test" },
    },
  };
  const startRes = mockRes();
  await createWorkflowInstance(startReq, startRes);
  assert.equal(startRes.statusCode, 201);
  const instanceId = startRes.body.data._id;

  const listTaskReq = {
    tenantId: tenant._id,
    user: admin,
    query: { assignee: "me" },
  };
  const listTaskRes = mockRes();
  await listWorkflowTasks(listTaskReq, listTaskRes);
  assert.equal(listTaskRes.statusCode, 200);
  const openTask = (listTaskRes.body.data || []).find(
    (item) => String(item.instanceId) === String(instanceId)
  );
  assert.ok(openTask, "Expected an open task for started instance");

  const completeReq = {
    tenantId: tenant._id,
    user: admin,
    params: { id: openTask._id.toString() },
    body: { output: { approved: true } },
  };
  const completeRes = mockRes();
  await completeWorkflowTask(completeReq, completeRes);
  assert.equal(completeRes.statusCode, 200);

  const getReq = {
    tenantId: tenant._id,
    user: admin,
    params: { id: instanceId.toString() },
  };
  const getRes = mockRes();
  await getWorkflowInstance(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.data.instance.status, "COMPLETED");
  assert.equal(getRes.body.data.instance.currentNodeId, "end");

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

