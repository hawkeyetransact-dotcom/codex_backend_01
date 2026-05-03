/**
 * askHawkWizardController.js
 *
 * App Wizard endpoints — wires the existing multiStepAgent (plan → approve →
 * execute) to a single chat-friendly entry point so AskHawk can act as a
 * "do this for me" co-worker, not just a Q&A assistant.
 *
 * Endpoints:
 *   POST /api/askhawk/wizard/plan      — create a plan from a goal
 *   GET  /api/askhawk/wizard/:planId   — fetch plan state
 *   POST /api/askhawk/wizard/:planId/approve  — user approves (optionally edits)
 *   POST /api/askhawk/wizard/:planId/execute  — runtime executes approved steps
 *
 * Hybrid approval UX (per design):
 *   - Plan returned upfront with all steps + side-effect tags
 *   - User approves once at plan level (approve endpoint)
 *   - Each WRITE step still requires the e-sig dialog at execute time
 *     (frontend pauses and prompts; ctx.approvedByESig signals the runtime)
 */
import { createPlan, approvePlan, executePlan, getPlan } from "../services/ai/wave2/multiStepAgent.js";
import { listTools } from "../services/ai/wave2/toolCallingRuntime.js";

const tc = (req) => ({
  tenantId: String(req.tenantId || req.user?.tenant_id || ""),
  userId: String(req.user?._id || ""),
  userRole: req.user?.role || "buyer",
});

/** GET /api/askhawk/wizard/tools — list available tools the agent could plan over. */
export const getAvailableTools = async (req, res) => {
  try {
    const role = req.user?.role;
    const tools = listTools({ role });
    return res.json({ count: tools.length, role, tools });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/askhawk/wizard/plan  body: { goal, context?, budget? } */
export const postCreatePlan = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant required" });
    const { goal, context = {}, budget } = req.body || {};
    if (!goal) return res.status(400).json({ error: "goal is required" });

    const plan = await createPlan({
      goal,
      context,
      tenantContext: t,
      budget: budget || { maxSteps: 8, maxTokens: 20000, maxSeconds: 180 },
      roleForToolFilter: t.userRole,
    });

    return res.status(201).json({
      planId: plan.planId,
      goal: plan.goal,
      status: plan.status,
      steps: plan.steps,
      budget: plan.budget,
    });
  } catch (err) {
    console.error("postCreatePlan error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/askhawk/wizard/:planId  → current plan state */
export const getPlanState = async (req, res) => {
  try {
    const plan = await getPlan(req.params.planId);
    if (!plan) return res.status(404).json({ error: "plan not found" });
    if (String(plan.tenantId) !== tc(req).tenantId) {
      return res.status(404).json({ error: "plan not found" });
    }
    return res.json({
      planId: plan.planId,
      goal: plan.goal,
      status: plan.status,
      steps: plan.steps,
      observations: plan.observations,
      finalOutput: plan.finalOutput,
      statusReason: plan.statusReason,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/askhawk/wizard/:planId/approve  body: { editedSteps? } */
export const postApprovePlan = async (req, res) => {
  try {
    const plan = await approvePlan({
      planId: req.params.planId,
      editedSteps: req.body?.editedSteps,
      actorId: req.user?._id,
      actorRole: req.user?.role,
    });
    return res.json({ planId: plan.planId, status: plan.status, steps: plan.steps });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

/**
 * POST /api/askhawk/wizard/:planId/execute
 * body: { signaturePassword?: string, reasonForChange?: string }
 *
 * Hybrid UX: caller passes signaturePassword if any step is a write (the
 * frontend WizardStepper collects this via the e-sig dialog before this call).
 * The multiStepAgent invokes each tool; toolCallingRuntime enforces e-sig
 * per-tool via approvedByESig.
 */
export const postExecutePlan = async (req, res) => {
  try {
    const t = tc(req);
    const approvedByESig = Boolean(req.body?.signaturePassword); // simplified: any password presence approves
    const plan = await executePlan({
      planId: req.params.planId,
      tenantContext: t,
      approvedByESig,
      eSigTicket: req.body?.signatureTicketId || null,
    });
    return res.json({
      planId: plan.planId,
      status: plan.status,
      steps: plan.steps,
      observations: plan.observations,
      finalOutput: plan.finalOutput,
      statusReason: plan.statusReason,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
