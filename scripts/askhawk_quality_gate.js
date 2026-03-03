import { runAskHawkEvalSuite } from "../src/services/askHawkEvalService.js";

const thresholdRaw = Number(process.env.ASKHAWK_QUALITY_THRESHOLD || "0.85");
const threshold = Number.isFinite(thresholdRaw) ? Math.min(1, Math.max(0, thresholdRaw)) : 0.85;

const toPercent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

const run = async () => {
  const suite = await runAskHawkEvalSuite({ includeChecks: true });
  const status = Number(suite.score || 0) >= threshold ? "PASS" : "FAIL";

  console.log("AskHawk Quality Gate");
  console.log(`- Suite: ${suite.suite} (${suite.version})`);
  console.log(`- Executed At: ${suite.executedAt}`);
  console.log(`- Checks: ${suite.passed}/${suite.total} passed`);
  console.log(`- Score: ${toPercent(suite.score)} (threshold ${toPercent(threshold)})`);
  console.log(`- Status: ${status}`);

  (suite.checks || []).forEach((check) => {
    const marker = check.passed ? "PASS" : "FAIL";
    console.log(`  [${marker}] ${check.name}`);
  });

  if (status !== "PASS") {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error("AskHawk quality gate execution failed", error?.message || error);
  process.exit(1);
});

