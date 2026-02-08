import { COMPLIANCE_VERDICTS } from "../../modules/compliance/constants.js";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "have",
  "has",
  "are",
  "was",
  "were",
  "your",
  "you",
  "does",
  "what",
  "where",
  "when",
  "please",
  "provide",
  "facility",
  "company",
  "document",
  "records",
  "record",
  "audit",
  "question",
  "standard",
]);

const toWords = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOP_WORDS.has(item));

const normalizeRef = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const normalizeYesNo = (value) => {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (raw === "YES" || raw === "Y" || raw === "TRUE") return "YES";
  if (raw === "NO" || raw === "N" || raw === "FALSE") return "NO";
  if (raw === "NA" || raw === "N/A" || raw === "NOT_APPLICABLE") return "NA";
  return "";
};

export const pickRegulatoryReference = (question = {}) => {
  const direct = String(question.cfrReference || "").trim();
  if (direct) return direct;
  if (Array.isArray(question.regulatoryReferences) && question.regulatoryReferences.length) {
    const first = question.regulatoryReferences[0] || {};
    if (typeof first === "string") return first.trim();
    const section = String(first.section || "").trim();
    const title = String(first.title || "").trim();
    const standard = String(first.standard || "").trim();
    return [standard, section, title].filter(Boolean).join(" ").trim();
  }
  return "";
};

export const mapControlsForQuestion = (question = {}, controls = []) => {
  const questionWords = new Set(
    toWords(
      [
        question.questionText || question.question || "",
        question.categoryName || "",
        pickRegulatoryReference(question),
      ]
        .filter(Boolean)
        .join(" ")
    )
  );

  const questionRefNorm = normalizeRef(
    question.cfrReference || pickRegulatoryReference(question)
  );

  const scored = (Array.isArray(controls) ? controls : []).map((control) => {
    const controlWords = new Set(
      toWords(
        [
          control.title || "",
          control.description || "",
          control.clauseRef || "",
          ...(Array.isArray(control.keywords) ? control.keywords : []),
          ...(Array.isArray(control.standardRefs) ? control.standardRefs : []),
        ].join(" ")
      )
    );

    let overlap = 0;
    questionWords.forEach((word) => {
      if (controlWords.has(word)) overlap += 1;
    });

    let refScore = 0;
    if (questionRefNorm && Array.isArray(control.standardRefs)) {
      const hasRef = control.standardRefs.some((item) =>
        normalizeRef(item).includes(questionRefNorm) || questionRefNorm.includes(normalizeRef(item))
      );
      if (hasRef) refScore = 4;
    }

    const keywordBoost = Array.isArray(control.keywords)
      ? control.keywords.reduce((acc, item) => {
          const next = normalizeRef(item);
          if (!next) return acc;
          if (questionRefNorm && questionRefNorm.includes(next)) return acc + 1;
          return acc;
        }, 0)
      : 0;

    const score = overlap + refScore + keywordBoost;
    return {
      controlId: control.controlId,
      title: control.title || "",
      clauseRef: control.clauseRef || "",
      standardRefs: Array.isArray(control.standardRefs) ? control.standardRefs : [],
      score,
      expectedAnswer: String(control.expectedAnswer || "ANY").toUpperCase(),
      requiredEvidence: Boolean(control.requiredEvidence),
    };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};

export const evaluateQuestionCompliance = ({ response = {}, mappedControls = [] } = {}) => {
  const yesNo = normalizeYesNo(response.yesNo);
  const text = String(response.text || "").trim();
  const hasText = text.length > 0;
  const hasStructured =
    response.responseDetails && typeof response.responseDetails === "object"
      ? Object.keys(response.responseDetails).length > 0
      : false;
  const hasEvidence = Boolean(response.hasEvidence);

  const topControl = mappedControls[0] || null;
  const expected = String(topControl?.expectedAnswer || "ANY").toUpperCase();
  const needsEvidence = Boolean(topControl?.requiredEvidence);
  const mappingScore = Number(topControl?.score || 0);

  let verdict = "INSUFFICIENT";
  if (yesNo === "YES") verdict = "COMPLIANT";
  else if (yesNo === "NO") verdict = "NON_COMPLIANT";
  else if (yesNo === "NA") verdict = "NOT_APPLICABLE";
  else if (hasText || hasStructured) verdict = expected === "TEXT" ? "COMPLIANT" : "INSUFFICIENT";

  if (expected === "YES" && yesNo === "NO") verdict = "NON_COMPLIANT";
  if (expected === "NO" && yesNo === "YES") verdict = "NON_COMPLIANT";
  if (expected === "TEXT" && !(hasText || hasStructured)) verdict = "INSUFFICIENT";

  if (needsEvidence && verdict === "COMPLIANT" && !hasEvidence) {
    verdict = "INSUFFICIENT";
  }

  const responseCompleteness = clamp(
    (yesNo ? 0.45 : 0) + (hasText ? 0.35 : 0) + (hasStructured ? 0.2 : 0),
    0,
    1
  );
  const mappingConfidence = clamp(mappingScore / 8, 0, 1);
  let confidence = clamp(0.35 + responseCompleteness * 0.4 + mappingConfidence * 0.25, 0.05, 0.99);
  if (needsEvidence && !hasEvidence) confidence = clamp(confidence - 0.18, 0.05, 0.99);

  let reason = "Insufficient response information.";
  if (verdict === "COMPLIANT") reason = "Response aligns with mapped standard control intent.";
  if (verdict === "NON_COMPLIANT") reason = "Response indicates control requirement is not met.";
  if (verdict === "NOT_APPLICABLE") reason = "Response marked as not applicable for this control.";
  if (needsEvidence && !hasEvidence) {
    reason = `${reason} Evidence reference is missing for a control that expects evidence.`;
  }

  return {
    verdict,
    confidence,
    reason,
    expectedAnswer: expected,
    requiredEvidence: needsEvidence,
  };
};

export const summarizeVerdicts = (results = [], useFinalVerdict = false) => {
  const summary = {
    total: 0,
    compliant: 0,
    nonCompliant: 0,
    insufficient: 0,
    notApplicable: 0,
  };

  (Array.isArray(results) ? results : []).forEach((item) => {
    const verdict = String(
      useFinalVerdict ? item.finalVerdict || item.machineVerdict : item.machineVerdict
    ).toUpperCase();
    if (!COMPLIANCE_VERDICTS.includes(verdict)) return;
    summary.total += 1;
    if (verdict === "COMPLIANT") summary.compliant += 1;
    if (verdict === "NON_COMPLIANT") summary.nonCompliant += 1;
    if (verdict === "INSUFFICIENT") summary.insufficient += 1;
    if (verdict === "NOT_APPLICABLE") summary.notApplicable += 1;
  });

  return summary;
};

