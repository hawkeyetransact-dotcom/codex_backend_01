import { OnboardingWizardState } from "../models/onboardingWizardStateModel.js";
import { OnboardingWizardPlaybookService } from "../services/onboardingWizardPlaybookService.js";

const resolveTenantId = (req) =>
  String(req.tenantId || req.user?.tenant_id || "").trim();

const resolveUserId = (req) => req.user?._id || null;

const ensureWizardState = async ({ tenantId, userId, role, playbook }) => {
  let state = await OnboardingWizardState.findOne({
    tenantId,
    userId,
    playbookKey: playbook.key,
  });
  if (state) return state;
  state = await OnboardingWizardState.create({
    tenantId,
    userId,
    role,
    playbookKey: playbook.key,
    playbookVersion: playbook.version || "v1",
    status: "NOT_STARTED",
    currentStepId: playbook.steps?.[0]?.id || "",
    completedStepIds: [],
    skippedStepIds: [],
    lastSeenAt: new Date(),
  });
  return state;
};

const applyStateAction = ({ state, action = "", stepId = "", playbook }) => {
  const now = new Date();
  const normalizedAction = String(action || "").toLowerCase().trim();
  const stepIds = new Set((playbook?.steps || []).map((step) => step.id));
  const completed = new Set(
    OnboardingWizardPlaybookService.dedupeList(state.completedStepIds || [])
  );
  const skipped = new Set(
    OnboardingWizardPlaybookService.dedupeList(state.skippedStepIds || [])
  );
  const normalizedStepId = String(stepId || "").trim();

  if (normalizedAction === "start") {
    state.status = "IN_PROGRESS";
    state.startedAt = state.startedAt || now;
    state.dismissedAt = null;
  } else if (normalizedAction === "dismiss") {
    state.status = "DISMISSED";
    state.dismissedAt = now;
  } else if (normalizedAction === "resume") {
    state.status = "IN_PROGRESS";
    state.dismissedAt = null;
    state.startedAt = state.startedAt || now;
  } else if (normalizedAction === "reset") {
    state.status = "NOT_STARTED";
    state.completedStepIds = [];
    state.skippedStepIds = [];
    state.currentStepId = playbook.steps?.[0]?.id || "";
    state.startedAt = null;
    state.completedAt = null;
    state.dismissedAt = null;
    state.lastSeenAt = now;
    return;
  } else if (normalizedAction === "complete_playbook") {
    state.status = "COMPLETED";
    state.completedStepIds = (playbook?.steps || []).map((step) => step.id);
    state.skippedStepIds = [];
    state.currentStepId = "";
    state.startedAt = state.startedAt || now;
    state.completedAt = now;
    state.dismissedAt = null;
    return;
  } else if (normalizedAction === "complete_step") {
    if (!normalizedStepId || !stepIds.has(normalizedStepId)) {
      const error = new Error("Valid stepId is required for complete_step");
      error.status = 400;
      throw error;
    }
    completed.add(normalizedStepId);
    skipped.delete(normalizedStepId);
    state.completedStepIds = [...completed];
    state.skippedStepIds = [...skipped];
    state.status = "IN_PROGRESS";
    state.startedAt = state.startedAt || now;
    state.dismissedAt = null;
  } else if (normalizedAction === "skip_step") {
    if (!normalizedStepId || !stepIds.has(normalizedStepId)) {
      const error = new Error("Valid stepId is required for skip_step");
      error.status = 400;
      throw error;
    }
    if (!completed.has(normalizedStepId)) skipped.add(normalizedStepId);
    state.skippedStepIds = [...skipped];
    state.status = "IN_PROGRESS";
    state.startedAt = state.startedAt || now;
    state.dismissedAt = null;
  } else if (normalizedAction === "unskip_step") {
    if (!normalizedStepId || !stepIds.has(normalizedStepId)) {
      const error = new Error("Valid stepId is required for unskip_step");
      error.status = 400;
      throw error;
    }
    skipped.delete(normalizedStepId);
    state.skippedStepIds = [...skipped];
  } else if (normalizedAction === "set_current_step") {
    if (!normalizedStepId || !stepIds.has(normalizedStepId)) {
      const error = new Error("Valid stepId is required for set_current_step");
      error.status = 400;
      throw error;
    }
    state.currentStepId = normalizedStepId;
    state.status = state.status === "NOT_STARTED" ? "IN_PROGRESS" : state.status;
    state.startedAt = state.startedAt || now;
    state.dismissedAt = null;
  } else {
    const error = new Error(
      "Unsupported action. Use start, complete_step, skip_step, unskip_step, set_current_step, dismiss, resume, reset, or complete_playbook."
    );
    error.status = 400;
    throw error;
  }

  const finalCompleted = OnboardingWizardPlaybookService.dedupeList(
    state.completedStepIds || []
  );
  const isCompleted = OnboardingWizardPlaybookService.isPlaybookCompleted({
    playbook,
    completedStepIds: finalCompleted,
  });
  if (isCompleted) {
    state.status = "COMPLETED";
    state.currentStepId = "";
    state.completedAt = state.completedAt || now;
  } else if (state.status === "COMPLETED") {
    state.status = "IN_PROGRESS";
    state.completedAt = null;
  }
  if (state.status !== "COMPLETED") {
    state.currentStepId = OnboardingWizardPlaybookService.getNextPendingStepId({
      playbook,
      completedStepIds: finalCompleted,
    });
  }
};

export const getOnboardingWizardPlaybook = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const userId = resolveUserId(req);
    if (!tenantId || !userId) {
      return res.status(400).json({ error: "Tenant and user context required" });
    }

    const role = OnboardingWizardPlaybookService.normalizeRole(req.user?.role || "");
    const playbook = OnboardingWizardPlaybookService.getPlaybookForRole(role);
    if (!playbook) {
      return res.json({
        success: true,
        data: {
          enabled: false,
          role,
          reason: "No onboarding playbook configured for this role",
        },
      });
    }

    const state = await ensureWizardState({ tenantId, userId, role, playbook });
    state.lastSeenAt = new Date();
    if (!state.currentStepId) {
      state.currentStepId = OnboardingWizardPlaybookService.getNextPendingStepId({
        playbook,
        completedStepIds: state.completedStepIds || [],
      });
    }
    await state.save();

    const contextRoute = String(req.query?.route || "");
    const wizard = OnboardingWizardPlaybookService.toClientState({
      state,
      playbook,
      contextRoute,
    });

    return res.json({
      success: true,
      data: {
        enabled: true,
        role,
        playbook: wizard,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load onboarding wizard",
    });
  }
};

export const patchOnboardingWizardState = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const userId = resolveUserId(req);
    if (!tenantId || !userId) {
      return res.status(400).json({ error: "Tenant and user context required" });
    }

    const role = OnboardingWizardPlaybookService.normalizeRole(req.user?.role || "");
    const playbook = OnboardingWizardPlaybookService.getPlaybookForRole(role);
    if (!playbook) {
      return res.status(400).json({ error: "No onboarding playbook configured for this role" });
    }

    const state = await ensureWizardState({ tenantId, userId, role, playbook });
    const { action, stepId, route } = req.body || {};

    applyStateAction({ state, action, stepId, playbook });
    state.playbookVersion = playbook.version || "v1";
    state.lastSeenAt = new Date();
    await state.save();

    const wizard = OnboardingWizardPlaybookService.toClientState({
      state,
      playbook,
      contextRoute: String(route || ""),
    });

    return res.json({
      success: true,
      data: {
        enabled: true,
        role,
        playbook: wizard,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to update onboarding wizard state",
    });
  }
};

