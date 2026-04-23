/**
 * Multi-Step Agent — Wave 2 implementation.
 *
 * Plan-then-execute pattern:
 *   1. createPlan: LLM drafts a structured plan (list of tool invocations).
 *   2. approvePlan: user reviews; optionally edits steps; approves.
 *   3. executePlan: runtime executes steps with budget enforcement.
 *
 * Each step invokes a tool via toolCallingRuntime. Each invocation writes
 * to AuditTrail. Plan-level state transitions are persisted to AiAgentPlan.
 */
import crypto from "crypto";
import { AiAgentPlan } from "../../../models/aiAgentPlanModel.js";
import { groundedGenerate } from "../grounded/groundedGenerationService.js";
import { invokeTool, listTools } from "./toolCallingRuntime.js";

const PROMPT_VERSION = "agent.plan@1.0.0";

const PLANNER_SYSTEM = `
You are a planning agent for a pharmaceutical Quality Management System.
Given a user goal, you propose an ordered plan of tool calls. Each step must
be justified (rationale) and reference a tool from the AVAILABLE_TOOLS list.

RULES:
- Do not call tools that don't exist in AVAILABLE_TOOLS.
- Prefer read-only tools first to build context, then write tools.
- Every write step must be followed by a verification read step where possible.
- Keep plan within the budget (max steps).
- Output is JSON, no prose.

OUTPUT FORMAT:
{
  "goal": "restated user goal",
  "reasoning": "1-2 sentence why-this-plan",
  "steps": [
    { "tool": "tool_name", "input": {...}, "rationale": "one line" },
    ...
  ],
  "confidence": 0.0,
  "citations": []  // reference your reasoning if you used tenant knowledge
}
`.trim();

function uuid() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Create a plan (state: pending_approval).
 * @returns the saved AiAgentPlan document.
 */
export async function createPlan({
  goal,
  context = {},
  tenantContext,
  llmConfig,
  budget = { maxSteps: 8, maxTokens: 20000, maxSeconds: 180 },
  roleForToolFilter,
} = {}) {
  if (!goal) throw new Error("createPlan: goal is required");
  if (!tenantContext?.tenantId) throw new Error("createPlan: tenantContext.tenantId required");

  const availableTools = listTools({ role: roleForToolFilter || tenantContext.userRole });
  const toolsBlock =
    "AVAILABLE_TOOLS:\n" +
    availableTools
      .map(
        (t) =>
          `- ${t.name} (${t.sideEffect})${t.requiresESig ? " [requires_esig]" : ""}: ${t.description}`
      )
      .join("\n");

  const userPrompt = [
    `GOAL: ${goal}`,
    "",
    "CONTEXT (from caller):",
    JSON.stringify(context || {}, null, 2),
    "",
    toolsBlock,
    "",
    `BUDGET: maxSteps=${budget.maxSteps}, maxTokens=${budget.maxTokens}, maxSeconds=${budget.maxSeconds}`,
    "",
    "Draft a minimal plan. Output strict JSON only.",
  ].join("\n");

  const result = await groundedGenerate({
    feature: "agent.create_plan",
    systemPrompt: PLANNER_SYSTEM,
    userPrompt,
    retrievalSet: [],
    outputSchema: { requiredFields: ["goal", "steps", "confidence", "citations"] },
    minConfidence: 0.4,
    requireCitations: false,
    tenantContext: { ...tenantContext, linkedEntityType: "ai_agent_plan" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    throw new Error(`agent.create_plan failed: ${result.reason}`);
  }

  // Validate all referenced tools exist.
  const availableNames = new Set(availableTools.map((t) => t.name));
  const steps = (result.output.steps || []).filter((s) => availableNames.has(s.tool));
  if (!steps.length) {
    throw new Error("agent.create_plan produced no valid tool steps");
  }

  const plan = await AiAgentPlan.create({
    planId: uuid(),
    tenantId: tenantContext.tenantId,
    actorId: tenantContext.userId,
    actorRole: tenantContext.userRole,
    goal,
    context,
    steps: steps.slice(0, budget.maxSteps),
    budget,
    status: "pending_approval",
  });

  return plan;
}

export async function approvePlan({
  planId,
  editedSteps,
  actorId,
  actorRole,
} = {}) {
  const plan = await AiAgentPlan.findOne({ planId });
  if (!plan) throw new Error(`plan not found: ${planId}`);
  if (plan.status !== "pending_approval") {
    throw new Error(`plan status ${plan.status} — cannot approve`);
  }
  if (Array.isArray(editedSteps) && editedSteps.length) {
    plan.steps = editedSteps.slice(0, plan.budget.maxSteps).map((s) => ({
      tool: s.tool,
      input: s.input || {},
      rationale: s.rationale || "",
      executed: false,
    }));
  }
  plan.status = "approved";
  await plan.save();
  return plan;
}

export async function executePlan({
  planId,
  tenantContext,
  approvedByESig = false,
  eSigTicket,
} = {}) {
  const plan = await AiAgentPlan.findOne({ planId });
  if (!plan) throw new Error(`plan not found: ${planId}`);
  if (plan.status !== "approved") {
    throw new Error(`plan status ${plan.status} — must be approved before execute`);
  }
  plan.status = "executing";
  await plan.save();

  const startedAt = Date.now();
  const deadline = startedAt + plan.budget.maxSeconds * 1000;
  let failure;

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      if (Date.now() > deadline) {
        failure = "budget_exceeded_time";
        break;
      }
      const step = plan.steps[i];
      if (step.executed) continue;
      const stepStart = Date.now();
      try {
        const output = await invokeTool(step.tool, step.input, {
          tenantId: tenantContext.tenantId,
          user: { _id: tenantContext.userId, role: tenantContext.userRole },
          auditId: tenantContext.auditId,
          linkedEntityType: "ai_agent_plan",
          linkedEntityId: plan.planId,
          approvedByESig,
          eSigTicket,
        });
        plan.steps[i].executed = true;
        plan.steps[i].executedAt = new Date();
        plan.steps[i].output = output;
        plan.steps[i].latencyMs = Date.now() - stepStart;
        plan.observations.push({ step: i, tool: step.tool, output });
        await plan.save();
      } catch (err) {
        plan.steps[i].executed = false;
        plan.steps[i].failure = err?.message || String(err);
        plan.steps[i].latencyMs = Date.now() - stepStart;
        failure = `step_${i}_failed: ${plan.steps[i].failure}`;
        await plan.save();
        break;
      }
    }
  } finally {
    plan.status = failure ? "failed" : "completed";
    plan.statusReason = failure;
    plan.completedAt = new Date();
    plan.finalOutput = {
      observations: plan.observations.slice(-plan.budget.maxSteps),
    };
    await plan.save();
  }
  return plan;
}

export async function revertStep({ planId, stepIndex, actorId, actorRole } = {}) {
  const plan = await AiAgentPlan.findOne({ planId });
  if (!plan) throw new Error(`plan not found: ${planId}`);
  if (!plan.steps[stepIndex]?.executed) {
    throw new Error(`step ${stepIndex} was not executed — nothing to revert`);
  }
  // Compensating entry — the actual inverse would live on each tool's
  // metadata. Here we record the revert intent in audit + plan state.
  plan.steps[stepIndex].executed = false;
  plan.steps[stepIndex].output = { ...(plan.steps[stepIndex].output || {}), _reverted: true, _revertedAt: new Date() };
  plan.observations.push({ step: stepIndex, tool: plan.steps[stepIndex].tool, action: "reverted", actorId, actorRole, at: new Date() });
  plan.status = "reverted";
  await plan.save();
  return plan;
}

export async function getPlan(planId) {
  return AiAgentPlan.findOne({ planId });
}

export const __private = { uuid, PROMPT_VERSION };
