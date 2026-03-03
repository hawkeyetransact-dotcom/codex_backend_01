import assert from "assert";
import { routeAskHawkIntent } from "../src/services/askHawkIntentRouterService.js";

const run = () => {
  const tool = routeAskHawkIntent({
    intent: "status",
    question: "Show audit progress and overdue CAPAs",
  });
  assert.equal(tool.mode, "tool");

  const draft = routeAskHawkIntent({
    intent: "summarize",
    question: "Draft a concise follow up note",
  });
  assert.equal(draft.mode, "draft");

  const faq = routeAskHawkIntent({
    question: "what is capa in hawkeye",
  });
  assert.equal(faq.mode, "faq");

  const knowledge = routeAskHawkIntent({
    question: "How do I map evidence in execution questionnaire screen?",
    screenId: "/test-artifacts",
    role: "AUDITOR",
  });
  assert.equal(knowledge.mode, "knowledge");
};

run();

