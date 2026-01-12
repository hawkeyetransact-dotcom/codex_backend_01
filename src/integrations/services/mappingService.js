import { IntegrationMappingConfig } from "../../models/integrationMappingConfigModel.js";

export const upsertMapping = async ({ tenantId, connectionId, eventType, body }) => {
  const existing = await IntegrationMappingConfig.findOne({ tenantId, connectionId, eventType });
  const version = existing ? (existing.version || 1) + 1 : 1;
  const payload = {
    sourceToCanonicalMap: body.sourceToCanonicalMap || {},
    transforms: body.transforms || [],
    fieldMasking: body.fieldMasking || [],
    approvedBySupplier: body.approvedBySupplier || false,
    version,
  };

  return IntegrationMappingConfig.findOneAndUpdate(
    { tenantId, connectionId, eventType },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const getMapping = async ({ tenantId, connectionId, eventType }) => {
  if (eventType) {
    return IntegrationMappingConfig.findOne({ tenantId, connectionId, eventType }).lean();
  }
  return IntegrationMappingConfig.find({ tenantId, connectionId }).lean();
};
