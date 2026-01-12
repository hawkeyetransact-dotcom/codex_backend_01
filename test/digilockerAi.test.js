import assert from "assert";
import { classifyAndExtract, suggestMappings } from "../src/services/ai/digilockerAiService.js";

const run = () => {
  const sampleText =
    "Standard Operating Procedure SOP-CLN-001 for cleaning. Quality Assurance review. Training required.";
  const result = classifyAndExtract({ text: sampleText });
  assert.strictEqual(result.docTypeGuess, "SOP");
  assert.strictEqual(result.departmentGuess, "QA");
  assert.ok(result.suggestedTags.some((tag) => tag.tag === "training"));

  const matches = suggestMappings({
    questionText: "Do you have a cleaning SOP in place?",
    candidates: [
      {
        documentId: "doc1",
        versionId: "ver1",
        title: "Cleaning SOP",
        docType: "SOP",
        tags: ["cleaning"],
        pages: ["This SOP covers cleaning procedures for production rooms."],
        text: sampleText,
      },
    ],
  });

  assert.ok(matches.length > 0);
  assert.ok(matches[0].confidence > 0);
};

run();
