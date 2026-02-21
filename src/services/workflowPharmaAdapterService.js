import { WorkflowDefinition } from "../models/workflowDefinitionModel.js";
import { WorkflowDefinitionVersion } from "../models/workflowDefinitionVersionModel.js";
import { WorkflowInstance } from "../models/workflowInstanceModel.js";
import { WorkflowRuntimeService } from "./workflowRuntimeService.js";

const PHARMA_PACK_KEY = "pharma_audit";
const DEFAULT_TEMPLATE_KEY = "pharma_audit.standard_gmp_audit";

const findBestPublishedDefinition = async ({ tenantId }) => {
  const byKey = await WorkflowDefinition.findOne({
    tenantId,
    key: DEFAULT_TEMPLATE_KEY,
    status: "PUBLISHED",
  }).lean();
  if (byKey) return byKey;

  return WorkflowDefinition.findOne({
    tenantId,
    packKey: PHARMA_PACK_KEY,
    status: "PUBLISHED",
  })
    .sort({ updatedAt: -1 })
    .lean();
};

export const WorkflowPharmaAdapterService = {
  async startForAuditRequest({ tenantId, auditRequest, actor }) {
    if (!tenantId || !auditRequest?._id) return { started: false, reason: "missing_input" };

    const existing = await WorkflowInstance.findOne({
      tenantId,
      "legacyRefs.auditRequestId": String(auditRequest._id),
    })
      .select("_id")
      .lean();
    if (existing) return { started: false, reason: "already_started", instanceId: existing._id };

    const definition = await findBestPublishedDefinition({ tenantId });
    if (!definition) return { started: false, reason: "definition_not_installed" };

    const version = await WorkflowDefinitionVersion.findOne({
      definitionId: definition._id,
      tenantId,
      status: "PUBLISHED",
    })
      .sort({ version: -1 })
      .lean();
    if (!version) return { started: false, reason: "version_not_published" };

    const instance = await WorkflowRuntimeService.startInstance({
      tenantId,
      definitionId: definition._id,
      versionId: version._id,
      context: {
        auditRequestId: String(auditRequest._id),
        hawkeyeRequestId: auditRequest.hawkeyeRequestId || auditRequest.internalRequestId || "",
        supplierId: String(auditRequest.supplier_id || ""),
        auditorId: String(auditRequest.auditor_id || ""),
        buyerId: String(auditRequest.create_by_buyer_id || ""),
        siteId: String(auditRequest.site_id || ""),
        productId: String(auditRequest.supplier_product_id || ""),
      },
      legacyRefs: {
        auditRequestId: String(auditRequest._id),
        auditRequestCollection: "audit-requests-master",
      },
      roleAssignments: {
        supplier: String(auditRequest.supplier_id || ""),
        auditor: String(auditRequest.auditor_id || ""),
        buyer: String(auditRequest.create_by_buyer_id || ""),
      },
      actor,
    });

    return { started: true, instanceId: instance._id };
  },
};

