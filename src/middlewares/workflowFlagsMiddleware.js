import { PHARMA_PACK_ENABLED, WORKFLOW_OS_ENABLED } from "../config/featureFlags.js";

export const requireWorkflowOsEnabled = (_req, res, next) => {
  if (!WORKFLOW_OS_ENABLED) {
    return res.status(404).json({ error: "Workflow OS is disabled" });
  }
  return next();
};

export const requirePharmaPackEnabled = (_req, res, next) => {
  if (!PHARMA_PACK_ENABLED) {
    return res.status(404).json({ error: "Pharma pack is disabled" });
  }
  return next();
};

