import assert from "assert";

process.env.USE_MEMORY_DB = "true";
process.env.ASKHAWK_ENABLED = "true";

const run = async () => {
  const mongooseMod = await import("mongoose");
  const mongoose = mongooseMod.default || mongooseMod;
  const { connectDatabase } = await import("../src/config/database.js");
  const { ingestAskHawkFileToKb } = await import("../src/services/askHawkDocumentIngestService.js");
  const { AskHawkEmbeddingService } = await import("../src/services/askHawkEmbeddingService.js");
  const { composeKnowledgeAnswer } = await import("../src/services/askHawkKnowledgeService.js");
  const KbArticleMod = await import("../src/models/kbArticleModel.js");
  const KbArticle = KbArticleMod.default || KbArticleMod;
  const KbChunkMod = await import("../src/models/kbChunkModel.js");
  const KbChunk = KbChunkMod.default || KbChunkMod;

  await connectDatabase();

  const tenantId = "tenant-askhawk-test";
  const role = "AUDITOR";
  const needle = "ultra-unique-askhawk-needle-48372";
  const file = {
    originalname: "askhawk-sample.txt",
    mimetype: "text/plain",
    buffer: Buffer.from(
      [
        "This is a tenant knowledge document for AskHawk.",
        `The controlled term is ${needle}.`,
        "CAPA ownership is assigned to QA head in this sample.",
      ].join("\n"),
      "utf8"
    ),
  };

  const ingestResult = await ingestAskHawkFileToKb({
    tenantId,
    role,
    file,
    productArea: "integration_test",
    tags: ["integration", "askhawk"],
    title: "AskHawk Integration Sample",
  });

  assert.ok(ingestResult.articleId, "expected article id");
  assert.ok(ingestResult.chunkCount > 0, "expected chunk count");

  const question = `In audit questionnaire context, what does the uploaded document say about ${needle}?`;
  const [chunks, queryEmbedding, queryLexical] = await Promise.all([
    KbChunk.find({ tenantId, productArea: "integration_test" }).lean(),
    AskHawkEmbeddingService.embedText(question),
    AskHawkEmbeddingService.lexicalVector(question),
  ]);
  const articles = await KbArticle.find({
    _id: { $in: chunks.map((chunk) => chunk.articleId).filter(Boolean) },
  }).lean();
  const articleById = new Map(articles.map((article) => [String(article._id), article]));

  const hits = chunks
    .map((chunk) => {
      const article = articleById.get(String(chunk.articleId)) || {};
      const semantic = AskHawkEmbeddingService.cosineSimilarity(
        queryEmbedding.vector || [],
        Array.isArray(chunk.embedding) ? chunk.embedding : []
      );
      const lexical = AskHawkEmbeddingService.lexicalCosine(
        queryLexical,
        AskHawkEmbeddingService.lexicalVector(chunk.content || "")
      );
      const score = semantic * 0.65 + lexical * 0.35;
      return {
        score,
        content: chunk.content,
        citation: chunk?.metadata?.citation || "",
        article: { title: article.title, slug: article.slug },
        productArea: chunk.productArea,
        tags: chunk.tags || [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const composed = composeKnowledgeAnswer(question, hits);

  assert.ok(composed?.answer, "expected answer text");
  assert.ok(Array.isArray(composed?.citations), "expected citations array");
  const expectedDocCitationPrefix = String(ingestResult.citations?.[0] || "").split("#")[0];
  assert.ok(
    composed.citations.some(
      (citation) =>
        String(citation).startsWith("doc:") &&
        (!expectedDocCitationPrefix || String(citation).startsWith(expectedDocCitationPrefix))
    ),
    "expected at least one document citation"
  );
  assert.ok(
    String(composed.answer).toLowerCase().includes("quick steps"),
    "expected composed answer format"
  );

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
