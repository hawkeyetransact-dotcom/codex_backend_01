import { ComplianceEvaluationService } from "./complianceEvaluationService.js";
import { StandardRegistryService } from "./standardRegistryService.js";

const DEFAULT_STANDARD_KEY = "ICH_Q7_CFR21";
const DEFAULT_STANDARD_VERSION = "1.0.0";

const toStatusError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const normalizeValue = (value) => String(value || "").trim();

const normalizeStandardKey = (value) => {
  const raw = normalizeValue(value);
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const pickPreferredStandard = (standards = [], preferredKey = "") => {
  const key = normalizeStandardKey(preferredKey);
  const list = Array.isArray(standards) ? standards : [];
  if (key) {
    const matched = list.filter(
      (item) => normalizeStandardKey(item?.standardKey) === key
    );
    if (matched.length) return matched[0];
  }
  return list[0] || null;
};

const listAllRunQuestions = async ({ tenantId, runId }) => {
  const items = [];
  const pageSize = 200;
  let page = 1;
  let total = 0;

  do {
    const chunk = await ComplianceEvaluationService.listRunQuestionResults({
      tenantId,
      runId,
      page,
      pageSize,
    });
    total = Number(chunk?.total || 0);
    if (Array.isArray(chunk?.items) && chunk.items.length) {
      items.push(...chunk.items);
    }
    page += 1;
  } while (items.length < total);

  return items;
};

export const resolveComplianceStandardForFlow = async ({
  tenantId,
  actorUserId,
  standardKey,
  standardVersion,
} = {}) => {
  if (!tenantId) throw toStatusError(400, "Tenant missing");
  await StandardRegistryService.ensureDefaults({ tenantId, actorUserId });

  const requestedKey = normalizeStandardKey(standardKey);
  const requestedVersion = normalizeValue(standardVersion);

  if (requestedKey && requestedVersion) {
    const standard = await StandardRegistryService.getStandard({
      tenantId,
      standardKey: requestedKey,
      version: requestedVersion,
      actorUserId,
    });
    if (!standard) {
      throw toStatusError(404, "Requested compliance standard/version not found");
    }
    return standard;
  }

  const standards = await StandardRegistryService.listStandards({
    tenantId,
    includeControls: true,
    includeArchived: false,
    actorUserId,
  });
  const preferred = pickPreferredStandard(
    standards,
    requestedKey || DEFAULT_STANDARD_KEY
  );
  if (preferred) return preferred;

  const fallback = await StandardRegistryService.getStandard({
    tenantId,
    standardKey: DEFAULT_STANDARD_KEY,
    version: DEFAULT_STANDARD_VERSION,
    actorUserId,
  });
  if (fallback) return fallback;

  throw toStatusError(404, "No active compliance standard configured for tenant");
};

export const runComplianceFlowForAudit = async ({
  tenantId,
  auditId,
  actorUserId,
  standardKey,
  standardVersion,
  mode = "ADVISORY",
  includeQuestionResults = false,
  hydrateEvidenceSuggestions = false,
} = {}) => {
  if (!tenantId) throw toStatusError(400, "Tenant missing");
  if (!auditId) throw toStatusError(400, "auditId is required");

  const standard = await resolveComplianceStandardForFlow({
    tenantId,
    actorUserId,
    standardKey,
    standardVersion,
  });

  const created = await ComplianceEvaluationService.createRun({
    tenantId,
    auditId,
    standardKey: standard.standardKey,
    standardVersion: standard.version,
    mode,
    actorUserId,
  });

  let questionResults = [];
  if (includeQuestionResults) {
    questionResults = await listAllRunQuestions({
      tenantId,
      runId: created?.run?._id,
    });
    if (hydrateEvidenceSuggestions && questionResults.length) {
      questionResults = await ComplianceEvaluationService.hydrateEvidenceSuggestions({
        tenantId,
        runId: created?.run?._id,
        questionResults,
      });
    }
  }

  return {
    run: created?.run || null,
    summary: created?.summary || null,
    snapshot: created?.snapshot || null,
    standard: {
      standardKey: standard.standardKey,
      version: standard.version,
      name: standard.name,
    },
    questionResults,
  };
};

