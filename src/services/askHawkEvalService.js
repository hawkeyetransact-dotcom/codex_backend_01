import {
  calculateRetrievalConfidence,
  rerankKnowledgeHits,
  validateAndNormalizeCitations,
} from "./askHawkKnowledgeService.js";
import { routeAskHawkIntent } from "./askHawkIntentRouterService.js";

const nowIso = () => new Date().toISOString();

const scoreCheck = (name, passed, details = {}) => ({
  name,
  passed: Boolean(passed),
  score: passed ? 1 : 0,
  details,
});

const runIntentEval = () => {
  const checks = [];
  checks.push(
    scoreCheck(
      "intent_tool",
      routeAskHawkIntent({
        intent: "status",
        question: "Show overdue CAPAs and audit progress",
      }).mode === "tool"
    )
  );
  checks.push(
    scoreCheck(
      "intent_draft",
      routeAskHawkIntent({
        intent: "summarize",
        question: "Draft a concise follow up note",
      }).mode === "draft"
    )
  );
  checks.push(
    scoreCheck(
      "intent_knowledge",
      routeAskHawkIntent({
        intent: "howto",
        question: "How do I map evidence to the execution questionnaire?",
        screenId: "/test-artifacts",
        role: "AUDITOR",
      }).mode === "knowledge"
    )
  );
  checks.push(
    scoreCheck(
      "intent_generic",
      routeAskHawkIntent({
        intent: "",
        question: "what is weather today in boston",
      }).mode === "generic"
    )
  );
  return checks;
};

const runCitationEval = () => {
  const audit = validateAndNormalizeCitations([
    "frontend/app/(console)/test-artifacts/page.tsx:1",
    "faq:hawkeye-overview",
    "bad citation format",
    "",
  ]);
  return [
    scoreCheck("citation_valid_count", audit.valid.length === 2, {
      valid: audit.valid.length,
      invalid: audit.invalid.length,
    }),
    scoreCheck("citation_invalid_count", audit.invalid.length === 1, {
      valid: audit.valid.length,
      invalid: audit.invalid.length,
    }),
  ];
};

const runConfidenceEval = () => {
  const high = calculateRetrievalConfidence([
    { score: 0.81 },
    { score: 0.44 },
    { score: 0.29 },
  ]);
  const low = calculateRetrievalConfidence([]);
  return [
    scoreCheck("confidence_high", high >= 0.65, { value: high }),
    scoreCheck("confidence_empty", low === 0, { value: low }),
  ];
};

const runRerankEval = async () => {
  const hits = [
    {
      source: "tenant_kb",
      score: 0.95,
      content: "Cafeteria menu and parking policy details.",
      citation: "bad citation",
      kind: "kb_chunk",
      repo: "tenant_kb",
      filePath: "hr-policy",
      meta: {},
    },
    {
      source: "tenant_kb",
      score: 0.62,
      content:
        "Endpoint: PATCH /api/next/auditor/test-artifacts/execution-rag-preview. This action runs questionnaire evidence mapping.",
      citation: "backend/src/routes/auditorRoutes.js:207",
      kind: "kb_chunk",
      repo: "tenant_kb",
      filePath: "auditor-routes",
      meta: {},
    },
  ];
  const ranked = await rerankKnowledgeHits(
    "How does execution rag preview endpoint map evidence to questionnaire?",
    hits,
    { limit: 2 }
  );
  const top = ranked[0] || null;
  return [
    scoreCheck("rerank_ordering", Boolean(top?.citation === "backend/src/routes/auditorRoutes.js:207"), {
      topCitation: top?.citation || null,
      topScore: Number(top?.score || 0),
    }),
  ];
};

const aggregate = (checks = []) => {
  const total = checks.length;
  const passed = checks.filter((item) => item.passed).length;
  const score = total ? Number((passed / total).toFixed(4)) : 0;
  return {
    total,
    passed,
    failed: Math.max(0, total - passed),
    score,
    passRate: score,
  };
};

export const runAskHawkEvalSuite = async ({ includeChecks = true } = {}) => {
  const checks = [
    ...runIntentEval(),
    ...runCitationEval(),
    ...runConfidenceEval(),
    ...(await runRerankEval()),
  ];
  const summary = aggregate(checks);
  return {
    suite: "askhawk_phase3_core",
    version: "2026-03-03",
    executedAt: nowIso(),
    ...summary,
    checks: includeChecks ? checks : [],
  };
};

