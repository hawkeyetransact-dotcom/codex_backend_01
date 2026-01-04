import assert from "assert";
import { sanitizeForLLM } from "../src/utils/sanitizeForLLM.js";

const run = async () => {
  const text = "Contact John Doe at john.doe@example.com or 555-123-4567";
  const sanitized = await sanitizeForLLM(text, {});
  assert.ok(!sanitized.includes("john.doe@example.com"));
  assert.ok(!sanitized.includes("555-123-4567"));
  assert.ok(!sanitized.includes("John Doe"));

  const custom = await sanitizeForLLM("Keyword FOOBAR present", { tenantId: null, role: null });
  assert.ok(custom.includes("Keyword"), "non-matching text should stay");
};

run();
