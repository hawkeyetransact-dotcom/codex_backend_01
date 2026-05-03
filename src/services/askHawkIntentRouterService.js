const TOOL_HINTS = [
  "status",
  "progress",
  "overdue",
  "milestone",
  "timeline",
  "count",
  "how many",
  "list",
  "open capa",
  "pending",
  "queue",
];

const DRAFT_HINTS = [
  "draft",
  "summarize",
  "summary",
  "rewrite",
  "rephrase",
  "email",
  "message",
  "note",
];

const FAQ_HINTS = [
  "what is hawkeye",
  "what is sop",
  "what is capa",
];

// Regulatory keywords — when the user is asking about an external standard
// (FDA / ICH / EU GMP / ISO / Annex) we route to the "regulatory" mode so
// the chat controller filters knowledge search to productArea="compliance"
// and formats citations as standard + clauseRef.
const REGULATORY_HINTS = [
  "fda", "21 cfr", "21cfr", "cfr 211", "cfr 11", "part 11", "part 211",
  "ich q", "ich q7", "ich q9", "ich q10", "ich e6", "ich e8",
  "eu gmp", "annex 11", "annex 16", "annex 1", "eu annex",
  "iso 9001", "iso 13485", "iso 14971", "iso 27001",
  "usp <", "usp chapter", "usp 1058", "usp 711",
  "pic/s", "pic s", "who trs", "who gmp", "pmda",
  "regulation", "regulatory requirement", "compliance requirement",
  "audit trail requirement", "electronic signature requirement",
  "alcoa", "alcoa+", "data integrity",
];

const FEATURE_HINTS = [
  "audit",
  "questionnaire",
  "artifact",
  "evidence",
  "digilocker",
  "supplier",
  "buyer",
  "auditor",
  "report",
  "workflow",
  "api",
  "screen",
  "button",
];

const normalize = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const containsAny = (text = "", patterns = []) =>
  patterns.some((item) => text.includes(String(item || "").toLowerCase()));

const scoreMatches = (text = "", patterns = []) =>
  patterns.reduce((acc, item) => (text.includes(String(item || "").toLowerCase()) ? acc + 1 : acc), 0);

export const routeAskHawkIntent = ({
  intent = "",
  question = "",
  screenId = "",
  role = "",
  productArea = "",
} = {}) => {
  const normalizedIntent = normalize(intent);
  const normalizedQuestion = normalize(question);
  const normalizedScreen = normalize(screenId);
  const normalizedRole = normalize(role);
  const normalizedProductArea = normalize(productArea);

  const explicitTool = containsAny(normalizedIntent, ["status", "progress", "metrics", "tool", "timeline"]);
  const explicitDraft = containsAny(normalizedIntent, ["draft", "summarize", "write"]);
  const explicitRegulatory = containsAny(normalizedIntent, ["regulatory", "regulation", "compliance", "standard"]);
  if (explicitTool) {
    return { mode: "tool", confidence: 0.95, reason: "explicit_intent_tool" };
  }
  if (explicitDraft) {
    return { mode: "draft", confidence: 0.9, reason: "explicit_intent_draft" };
  }
  if (explicitRegulatory) {
    return { mode: "regulatory", confidence: 0.95, reason: "explicit_intent_regulatory" };
  }

  // Regulatory questions take priority over the FAQ short-circuits because
  // a user might ask "what is ICH Q7" — that's regulatory, not FAQ.
  const regulatoryScore = scoreMatches(normalizedQuestion, REGULATORY_HINTS);
  if (regulatoryScore >= 1) {
    return { mode: "regulatory", confidence: regulatoryScore >= 2 ? 0.92 : 0.84, reason: "regulatory_keyword_match" };
  }

  if (containsAny(normalizedQuestion, FAQ_HINTS)) {
    return { mode: "faq", confidence: 0.94, reason: "faq_pattern" };
  }

  const toolScore = scoreMatches(normalizedQuestion, TOOL_HINTS);
  const draftScore = scoreMatches(normalizedQuestion, DRAFT_HINTS);
  const featureScore =
    scoreMatches(normalizedQuestion, FEATURE_HINTS) +
    (normalizedScreen ? 1 : 0) +
    (normalizedProductArea ? 1 : 0) +
    (normalizedRole ? 1 : 0);

  if (toolScore >= 2) {
    return { mode: "tool", confidence: 0.86, reason: "question_tool_score" };
  }
  if (draftScore >= 2) {
    return { mode: "draft", confidence: 0.82, reason: "question_draft_score" };
  }
  if (!featureScore) {
    return { mode: "generic", confidence: 0.72, reason: "non_feature_query" };
  }

  return { mode: "knowledge", confidence: 0.88, reason: "feature_grounded_default" };
};

