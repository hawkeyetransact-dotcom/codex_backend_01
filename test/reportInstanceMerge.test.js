import assert from "assert";
import { mergeReportTemplate } from "../src/utils/reportTemplateEngine.js";

const template = {
  blocks: [
    {
      id: "bullets-1",
      type: "bullets",
      heading: "Summary of Key Findings",
      listPlaceholderPath: "summary.keyFindings",
    },
    {
      id: "rich-1",
      type: "richText",
      content: "Auditor: {{auditor.name}}",
    },
  ],
};

const data = {
  summary: { keyFindings: [] },
  auditor: { name: "Jane Auditor" },
};

const run = async () => {
  const { renderedBlocks, highlights } = mergeReportTemplate(template, data);
  assert.strictEqual(renderedBlocks[0].items[0].value, "_____");
  assert.strictEqual(renderedBlocks[1].content.includes("Jane Auditor"), true);
  const missing = highlights.find((h) => h.placeholder === "summary.keyFindings");
  assert.ok(missing);
  assert.strictEqual(missing.missing, true);
};

run();
