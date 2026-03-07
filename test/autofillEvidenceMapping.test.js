import assert from "assert";
import {
  buildEvidenceReferences,
  buildRegulatoryReferences,
  toAutoFillStatus,
  toConfidenceScore,
} from "../src/controllers/autoFillController.js";

const run = () => {
  const questions = [
    {
      _id: "q1",
      question: "Describe cleaning validation and change control procedure.",
      regulatoryReferences: [{ standard: "ICH Q7", section: "12.7", title: "Cleaning validation" }],
      cfrReference: "21 CFR 211.67",
    },
  ];

  const evidenceDetails = [
    {
      name: "Quality-Manual.pdf",
      sourceUrl: "https://example.com/quality-manual.pdf",
      pages: [
        {
          page: 12,
          text: "Cleaning validation program is defined. Change control procedure is documented and approved.",
          textLower:
            "cleaning validation program is defined. change control procedure is documented and approved.",
        },
      ],
    },
  ];

  const refs = buildEvidenceReferences(questions, evidenceDetails);
  const q1Refs = refs.get("q1");
  assert.ok(q1Refs, "expected evidence references for q1");
  assert.ok(Array.isArray(q1Refs.sources) && q1Refs.sources.length > 0, "expected source labels");
  assert.ok(Array.isArray(q1Refs.references) && q1Refs.references.length > 0, "expected detailed references");
  assert.strictEqual(q1Refs.references[0].sourceDocumentName, "Quality-Manual.pdf");
  assert.strictEqual(q1Refs.references[0].pageNumber, 12);

  assert.strictEqual(toAutoFillStatus({ hasAny: true, full: true }, true), "exact_match");
  assert.strictEqual(toAutoFillStatus({ hasAny: true, full: false }, true), "supported_inference");
  assert.strictEqual(toAutoFillStatus({ hasAny: true, full: false }, false), "partial_evidence");
  assert.strictEqual(toAutoFillStatus({ hasAny: false, full: false }, false), "needs_human_review");

  const scoreExact = toConfidenceScore({ hasAny: true, full: true }, true);
  const scorePartial = toConfidenceScore({ hasAny: true, full: false }, false);
  const scoreNone = toConfidenceScore({ hasAny: false, full: false }, false);
  assert.ok(scoreExact > scorePartial, "expected exact confidence > partial confidence");
  assert.ok(scorePartial > scoreNone, "expected partial confidence > no-evidence confidence");

  const regulatory = buildRegulatoryReferences(questions[0]);
  assert.ok(regulatory.some((ref) => /ich q7/i.test(String(ref.citation || ""))), "expected ICH reference");
  assert.ok(regulatory.some((ref) => /21 cfr 211.67/i.test(String(ref.citation || ""))), "expected CFR reference");

  console.log("autofill evidence mapping tests passed");
};

run();
