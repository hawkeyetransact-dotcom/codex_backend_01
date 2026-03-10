import { CAPARiskIndicator } from "../../models/CAPARiskIndicator.js";
import { InternalCAPAReference } from "../../models/InternalCAPAReference.js";

const keywordMatch = (value, words = []) => {
  const text = String(value || "").toLowerCase();
  return words.some((word) => text.includes(String(word).toLowerCase()));
};

const toQuestionPack = ({ code, title, reason, sourceSignals, questions }) => ({
  code,
  title,
  reason,
  sourceSignals: sourceSignals || [],
  questions: questions || [],
});

const CONTAMINATION_PACK = toQuestionPack({
  code: "EQMS_CONTAMINATION_CONTROL",
  title: "Contamination Control Deep-Dive",
  reason: "Contamination-related CAPA history detected.",
  sourceSignals: ["CAPA risk category: contamination", "eQMS CAPA trend"],
  questions: [
    "Describe contamination prevention controls for material/personnel flow.",
    "Provide recent environmental monitoring trend reviews and excursions.",
    "Explain aseptic controls and escalation path for contamination findings.",
  ],
});

const DEVIATION_PACK = toQuestionPack({
  code: "EQMS_PROCESS_ROBUSTNESS",
  title: "Process Robustness and Recurrence",
  reason: "Repeated deviations or recurring CAPA signals identified.",
  sourceSignals: ["Recurring CAPA flag", "Deviation history"],
  questions: [
    "Describe root-cause methodology used for recurring process deviations.",
    "Provide effectiveness checks for repeat deviation CAPAs.",
    "Explain governance for recurrence prevention and verification timing.",
  ],
});

const TRAINING_PACK = toQuestionPack({
  code: "EQMS_TRAINING_COMPLIANCE",
  title: "Training and Competency Assurance",
  reason: "Training-related CAPAs found in supplier/site quality history.",
  sourceSignals: ["Training CAPA signals"],
  questions: [
    "Provide role-wise GMP training matrix and completion evidence.",
    "How are training effectiveness and retraining triggers assessed?",
    "Describe how new SOP revisions are linked to training completion.",
  ],
});

const CAPA_GOVERNANCE_PACK = toQuestionPack({
  code: "EQMS_CAPA_GOVERNANCE",
  title: "CAPA Governance and Timeliness",
  reason: "Overdue/open CAPA risk detected.",
  sourceSignals: ["Overdue CAPA flag", "Open CAPA count"],
  questions: [
    "Describe CAPA prioritization and escalation for overdue items.",
    "Provide recent CAPA aging analysis and closure governance.",
    "How is management review used to close long-open CAPAs?",
  ],
});

const HIGH_RISK_PACK = toQuestionPack({
  code: "EQMS_HIGH_RISK_ESCALATION",
  title: "High-Risk Management Oversight",
  reason: "Supplier/site is currently high-risk based on CAPA indicators.",
  sourceSignals: ["Risk level HIGH/CRITICAL"],
  questions: [
    "Describe executive oversight cadence for high-risk quality events.",
    "Provide mitigation plan with timelines and accountability owners.",
    "Explain trigger criteria for enhanced audit frequency.",
  ],
});

const toObjectIdOrString = (value) => (value ? String(value) : "");

export const buildDynamicQuestionnaire = async ({
  tenantId,
  supplierId,
  siteId,
  auditType = "SUPPLIER_AUDIT",
} = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  if (!supplierId) throw new Error("supplierId is required");

  const indicatorQuery = { tenantId, supplierId };
  if (siteId) indicatorQuery.siteId = siteId;

  const indicator = await CAPARiskIndicator.findOne(indicatorQuery).lean();
  const history = await InternalCAPAReference.find({
    tenantId,
    supplierId,
    ...(siteId ? { siteId } : {}),
  })
    .sort({ openedDate: -1, createdAt: -1 })
    .limit(500)
    .lean();

  const hasContamination = history.some((row) =>
    keywordMatch(row.riskCategory, ["contamination", "sterility", "microbial", "bioburden"])
  );
  const hasTraining = history.some((row) => keywordMatch(row.riskCategory, ["training", "competency", "qualification"]));

  const recurringFlag = Boolean(indicator?.recurringCAPAFlag);
  const overdueFlag = Boolean(indicator?.overdueCAPAFlag);
  const riskLevel = String(indicator?.riskLevel || "LOW").toUpperCase();

  const packs = [];
  if (hasContamination) packs.push(CONTAMINATION_PACK);
  if (recurringFlag) packs.push(DEVIATION_PACK);
  if (hasTraining) packs.push(TRAINING_PACK);
  if (overdueFlag) packs.push(CAPA_GOVERNANCE_PACK);
  if (["HIGH", "CRITICAL"].includes(riskLevel)) packs.push(HIGH_RISK_PACK);

  const fallbackPack = toQuestionPack({
    code: "EQMS_BASELINE",
    title: "Baseline CAPA Intelligence Review",
    reason: "No high-confidence targeted patterns detected; include baseline questions.",
    sourceSignals: ["Baseline risk review"],
    questions: [
      "Summarize top CAPA categories over the last 12 months.",
      "Provide current open vs closed CAPA trend and overdue controls.",
      "Describe CAPA effectiveness verification model.",
    ],
  });

  const recommendations = packs.length ? packs : [fallbackPack];

  return {
    auditType,
    context: {
      tenantId: toObjectIdOrString(tenantId),
      supplierId: toObjectIdOrString(supplierId),
      siteId: toObjectIdOrString(siteId),
      riskLevel,
      riskScore: Number(indicator?.riskScore || 0),
      openCAPACount: Number(indicator?.openCAPACount || 0),
      criticalCAPACount: Number(indicator?.criticalCAPACount || 0),
      recurringCAPAFlag: recurringFlag,
      overdueCAPAFlag: overdueFlag,
      historyRecordsScanned: history.length,
    },
    recommendations,
  };
};
