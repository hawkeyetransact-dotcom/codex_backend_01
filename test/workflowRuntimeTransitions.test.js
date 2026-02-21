import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { WorkflowDefinition } from "../src/models/workflowDefinitionModel.js";
import { WorkflowDefinitionVersion } from "../src/models/workflowDefinitionVersionModel.js";
import { WorkflowTask } from "../src/models/workflowTaskModel.js";
import { WorkflowRuntimeService } from "../src/services/workflowRuntimeService.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenant = await Tenant.create({ name: "wf-tenant", displayName: "Workflow Tenant", type: "INTERNAL" });
  const buyer = await User.create({
    email: "buyer.workflow@test.com",
    password: "pass",
    role: "buyer",
    tenant_id: tenant._id,
  });

  const definition = await WorkflowDefinition.create({
    tenantId: tenant._id,
    packKey: "pharma_audit",
    key: "pharma_audit.guard_test",
    name: "Guard Transition Test",
    status: "PUBLISHED",
    latestVersion: 1,
  });

  const definitionPayload = {
    key: "pharma_audit.guard_test",
    name: "Guard Transition Test",
    packKey: "pharma_audit",
    version: 1,
    startNodeId: "start",
    nodes: [
      { id: "start", type: "start", name: "Start" },
      {
        id: "supplier_response",
        type: "human_task",
        name: "Supplier Response",
        role: "buyer",
        task: { title: "Respond" },
      },
      {
        id: "ich_q7",
        type: "ai_skill",
        name: "ICH Q7 Mapping",
        config: { skill: "ich_q7_mapping" },
      },
      {
        id: "capa_loop",
        type: "human_task",
        name: "CAPA Loop",
        role: "buyer",
        task: { title: "CAPA" },
      },
      { id: "end", type: "end", name: "End" },
    ],
    edges: [
      { from: "start", to: "supplier_response", on: "node.completed", priority: 10 },
      { from: "supplier_response", to: "ich_q7", on: "task.completed", priority: 10 },
      {
        from: "ich_q7",
        to: "capa_loop",
        on: "node.completed",
        guard: "payload.nonCompliantCount > 0",
        priority: 10,
      },
      {
        from: "ich_q7",
        to: "end",
        on: "node.completed",
        guard: "payload.nonCompliantCount <= 0",
        priority: 20,
      },
      { from: "capa_loop", to: "end", on: "task.completed", priority: 10 },
    ],
  };

  const version = await WorkflowDefinitionVersion.create({
    tenantId: tenant._id,
    definitionId: definition._id,
    packKey: "pharma_audit",
    version: 1,
    status: "PUBLISHED",
    definition: definitionPayload,
    publishedAt: new Date(),
  });
  definition.latestVersionId = version._id;
  await definition.save();

  // Path 1: non-compliant branch routes to CAPA
  const instanceA = await WorkflowRuntimeService.startInstance({
    tenantId: tenant._id,
    definitionId: definition._id,
    versionId: version._id,
    actor: buyer,
    context: {},
  });
  assert.equal(instanceA.currentNodeId, "supplier_response");
  let openTask = await WorkflowTask.findOne({
    tenantId: tenant._id,
    instanceId: instanceA._id,
    status: "OPEN",
  });
  assert.ok(openTask);
  await WorkflowRuntimeService.completeTask({
    tenantId: tenant._id,
    taskId: openTask._id,
    actor: buyer,
    output: { nonCompliantCount: 2 },
  });
  const reloadedA = await WorkflowRuntimeService.getInstanceDetails({
    tenantId: tenant._id,
    instanceId: instanceA._id,
  });
  assert.equal(reloadedA.instance.currentNodeId, "capa_loop");
  assert.equal(reloadedA.instance.status, "RUNNING");

  // Path 2: compliant branch routes directly to end
  const instanceB = await WorkflowRuntimeService.startInstance({
    tenantId: tenant._id,
    definitionId: definition._id,
    versionId: version._id,
    actor: buyer,
    context: {},
  });
  openTask = await WorkflowTask.findOne({
    tenantId: tenant._id,
    instanceId: instanceB._id,
    status: "OPEN",
  });
  assert.ok(openTask);
  await WorkflowRuntimeService.completeTask({
    tenantId: tenant._id,
    taskId: openTask._id,
    actor: buyer,
    output: { nonCompliantCount: 0 },
  });
  const reloadedB = await WorkflowRuntimeService.getInstanceDetails({
    tenantId: tenant._id,
    instanceId: instanceB._id,
  });
  assert.equal(reloadedB.instance.currentNodeId, "end");
  assert.equal(reloadedB.instance.status, "COMPLETED");

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

