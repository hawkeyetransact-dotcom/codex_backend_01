// src/services/workflowEngine/WorkflowDefinitionService.js

import WorkflowDefinition from '../../models/WorkflowDefinitionModel.js';

export const getDefinition = async (workflowKey) => {
  const def = await WorkflowDefinition.findOne({ workflowKey, isActive: true }).lean();
  if (!def) throw new Error(`WorkflowDefinition not found for key: ${workflowKey}`);
  return def;
};

export const getDefinitionsForTenant = async (tenantId) => {
  return WorkflowDefinition.find({
    isActive: true,
    $or: [{ tenantId: null }, { tenantId }],
  }).lean();
};

export const getPhaseDisplayName = async (workflowKey, phaseKey) => {
  const def = await getDefinition(workflowKey);
  const phase = def.phases.find((p) => p.key === phaseKey);
  return phase?.displayName ?? phaseKey;
};
