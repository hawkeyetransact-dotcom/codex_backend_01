import assert from "assert";
import {
  evaluateQuestionCompliance,
  mapControlsForQuestion,
  normalizeYesNo,
  summarizeVerdicts,
} from "../src/services/compliance/complianceRules.js";

const run = () => {
  assert.strictEqual(normalizeYesNo("yes"), "YES");
  assert.strictEqual(normalizeYesNo("No"), "NO");
  assert.strictEqual(normalizeYesNo("n/a"), "NA");

  const controls = [
    {
      controlId: "DOCUMENT_CONTROL",
      title: "Document and Record Control",
      description: "SOP and record revision process",
      clauseRef: "ICH Q7 6.1",
      standardRefs: ["21 CFR 211.100"],
      keywords: ["sop", "record", "revision"],
      expectedAnswer: "YES",
      requiredEvidence: true,
    },
  ];

  const mapped = mapControlsForQuestion(
    {
      questionText: "Are SOP revision and record controls defined and approved?",
      cfrReference: "21 CFR 211.100",
      categoryName: "Documentation",
    },
    controls
  );
  assert.ok(mapped.length > 0);
  assert.strictEqual(mapped[0].controlId, "DOCUMENT_CONTROL");

  const compliantWithEvidence = evaluateQuestionCompliance({
    response: {
      yesNo: "Yes",
      text: "",
      responseDetails: {},
      hasEvidence: true,
    },
    mappedControls: mapped,
  });
  assert.strictEqual(compliantWithEvidence.verdict, "COMPLIANT");

  const degradedWithoutEvidence = evaluateQuestionCompliance({
    response: {
      yesNo: "Yes",
      text: "",
      responseDetails: {},
      hasEvidence: false,
    },
    mappedControls: mapped,
  });
  assert.strictEqual(degradedWithoutEvidence.verdict, "INSUFFICIENT");

  const summary = summarizeVerdicts([
    { machineVerdict: "COMPLIANT" },
    { machineVerdict: "NON_COMPLIANT" },
    { machineVerdict: "INSUFFICIENT" },
    { machineVerdict: "NOT_APPLICABLE" },
  ]);
  assert.deepStrictEqual(summary, {
    total: 4,
    compliant: 1,
    nonCompliant: 1,
    insufficient: 1,
    notApplicable: 1,
  });
};

run();

