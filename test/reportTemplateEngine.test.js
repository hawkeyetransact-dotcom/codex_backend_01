import assert from "assert";
import { mergeReportTemplate } from "../src/utils/reportTemplateEngine.js";

const template = {
  blocks: [
    {
      id: "title-1",
      type: "title",
      content: "Audit Report for {{auditee.name}}",
    },
    {
      id: "meta-1",
      type: "meta",
      heading: "Facility",
      fields: [
        { label: "Site", placeholderPath: "auditee.siteName" },
        { label: "Address", placeholderPath: "auditee.address" },
      ],
    },
    {
      id: "bullets-1",
      type: "bullets",
      listPlaceholderPath: "summary.keyFindings",
    },
    {
      id: "obs-1",
      type: "observations",
      observationMapping: {
        listPath: "observations",
        fields: {
          no: "no",
          severity: "severity",
          reference: "reference",
          description: "description",
          evidence: "evidence",
          recommendation: "recommendation",
        },
      },
    },
  ],
};

const data = {
  auditee: {
    name: "Acme Pharma",
    siteName: "Plant A",
  },
  summary: {
    keyFindings: ["Batch records incomplete"],
  },
  observations: [
    {
      no: 1,
      severity: "Major",
      reference: "QMS-1",
      description: "Missing deviation log entries",
      evidence: "Logbook 2024",
      recommendation: "Implement review checklist",
    },
  ],
};

const run = async () => {
  const { renderedBlocks, highlights } = mergeReportTemplate(template, data);
  assert.strictEqual(renderedBlocks[0].content.includes("Acme Pharma"), true);
  assert.strictEqual(renderedBlocks[1].fields[0].value, "Plant A");
  assert.strictEqual(renderedBlocks[1].fields[1].value, "_____");
  assert.strictEqual(renderedBlocks[2].items[0].value, "Batch records incomplete");
  assert.strictEqual(renderedBlocks[3].observations[0].severity, "Major");

  const missingHighlight = highlights.find((h) => h.placeholder === "auditee.address");
  assert.ok(missingHighlight);
  assert.strictEqual(missingHighlight.missing, true);
};

run();
