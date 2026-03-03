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
  "ich q7",
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
  if (explicitTool) {
    return { mode: "tool", confidence: 0.95, reason: "explicit_intent_tool" };
  }
  if (explicitDraft) {
    return { mode: "draft", confidence: 0.9, reason: "explicit_intent_draft" };
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

