import assert from "assert";
import {
  __testables,
  buildKnowledgeIndexFromDocuments,
  composeKnowledgeAnswer,
  rerankKnowledgeHits,
  searchInKnowledgeIndex,
} from "../src/services/askHawkKnowledgeService.js";

const makeChunk = ({
  content,
  title = "Doc",
  slug = "doc",
  productArea = "questionnaire_and_artifacts",
  tags = [],
  citation = "frontend/app/audits/page.tsx:1",
  filePath = "app/audits/page.tsx",
  kind = "facts",
  meta = {},
}) => ({
  source: "local_code",
  articleKey: slug,
  title,
  slug,
  productArea,
  tags,
  repo: "frontend",
  filePath,
  kind,
  lineStart: 1,
  lineEnd: 20,
  content,
  normalizedContent: __testables.normalizeText(content),
  vector: __testables.vectorize(content),
  pathTokens: new Set(__testables.tokenize(filePath)),
  meta,
  citation,
});

const run = async () => {
  const route = __testables.extractFrontendRoute("app/(console)/audits/[id]/artifacts/[artifactId]/page.tsx");
  assert.equal(route, "/audits/[id]/artifacts/[artifactId]");

  const docs = [
    {
      chunks: [
        makeChunk({
          content:
            "Facts\n- Screen: /audits/[id]/artifacts/[artifactId]\n- Calls API: PATCH /api/next/audits/{id}/artifact\n- Endpoint: PATCH /api/audit-phase/artifact",
          tags: ["audit", "artifact"],
          citation: "frontend/app/(console)/audits/[id]/artifacts/[artifactId]/page.tsx:1",
          filePath: "app/(console)/audits/[id]/artifacts/[artifactId]/page.tsx",
          meta: {
            screenRoute: "/audits/[id]/artifacts/[artifactId]",
            endpoints: ["PATCH /api/audit-phase/artifact"],
          },
        }),
      ],
    },
    {
      chunks: [
        makeChunk({
          content:
            "router.patch('/audit-phase/artifact', authorize, saveArtifact);\nexport const saveArtifact = async (req, res) => { /* ... */ };",
          productArea: "questionnaire_and_artifacts",
          tags: ["audit", "artifact", "backend"],
          citation: "backend/src/routes/auditPhaseRoutes.js:88",
          filePath: "src/routes/auditPhaseRoutes.js",
          kind: "source",
          meta: {
            endpoints: ["PATCH /api/audit-phase/artifact"],
          },
        }),
      ],
    },
  ];

  const index = buildKnowledgeIndexFromDocuments(docs);
  const hits = searchInKnowledgeIndex(index, {
    query: "Where is artifact edit wording saved in audits screen?",
    limit: 4,
    minScore: 0.05,
  });
  assert.ok(hits.length >= 1, "expected at least one hit");
  assert.ok(
    hits.some((hit) => String(hit.citation).includes("artifact")),
    "expected artifact-related citation"
  );

  const composed = composeKnowledgeAnswer(
    "How does artifact edit wording work?",
    hits
  );
  assert.ok(
    composed.answer.includes("Quick steps:"),
    "expected concise workflow steps header"
  );
  assert.ok(
    composed.answer.toLowerCase().includes("audits"),
    "expected screen hint in response"
  );
  assert.ok(
    composed.citations.length > 0,
    "expected citations to be included"
  );

  const citationAudit = __testables.validateAndNormalizeCitations([
    "frontend/app/(console)/audits/[id]/artifacts/[artifactId]/page.tsx:1",
    "faq:hawkeye-overview",
    "not a valid citation",
  ]);
  assert.equal(citationAudit.valid.length, 2, "expected two valid citations");
  assert.equal(citationAudit.invalid.length, 1, "expected one invalid citation");

  const reranked = await rerankKnowledgeHits("artifact endpoint save action", hits, { limit: 3 });
  assert.ok(Array.isArray(reranked) && reranked.length > 0, "expected reranked hits");
  assert.ok(Number(reranked[0].score || 0) >= Number(reranked[reranked.length - 1].score || 0));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

