/**
 * seed-regulatory-corpus.mjs
 *
 * Loads src/data/regulatory-corpus.json into the AskHawk knowledge base
 * (KbArticle + KbChunk) so the regulatory Q&A mode can find + cite real
 * clauses with proper standardKey + clauseRef metadata.
 *
 * Idempotent — safe to re-run. One KbArticle per standard, one KbChunk
 * per clause.
 *
 * Usage: node scripts/seed-regulatory-corpus.mjs [--tenant-key <key>]
 *   --tenant-key  override the article tenantId (default: __platform__ →
 *                 visible to all tenants).
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import KbArticle from "../src/models/kbArticleModel.js";
import KbChunk from "../src/models/kbChunkModel.js";
import { AskHawkEmbeddingService } from "../src/services/askHawkEmbeddingService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CORPUS_PATH = join(__dirname, "..", "src", "data", "regulatory-corpus.json");

const SOURCE = "regulatory_standard";
const PRODUCT_AREA = "compliance";

const tenantKeyArg = process.argv.find((a) => a.startsWith("--tenant-key="));
const TENANT_KEY = tenantKeyArg ? tenantKeyArg.split("=")[1] : "__platform__";

const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}\nTenant key: ${TENANT_KEY}`);

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
console.log(`Corpus version ${corpus.version} · ${corpus.standards.length} standards\n`);

let articlesUpserted = 0;
let chunksUpserted = 0;
let chunksSkipped = 0;

for (const std of corpus.standards) {
  const slug = `regstd-${slugify(std.standardKey)}`;
  const articleTags = ["regulatory", std.standardKey, std.jurisdiction];

  const article = await KbArticle.findOneAndUpdate(
    { slug },
    {
      $set: {
        tenantId: TENANT_KEY,
        role: "all",
        productArea: PRODUCT_AREA,
        tags: articleTags,
        title: std.title,
        slug,
        summary: std.summary,
        source: SOURCE,
      },
    },
    { upsert: true, new: true }
  );
  articlesUpserted++;
  console.log(`Article: ${std.standardKey.padEnd(22)} ${article._id}`);

  for (let i = 0; i < std.clauses.length; i++) {
    const clause = std.clauses[i];
    const content = `${clause.citationLabel} — ${clause.title}\n\n${clause.text}`;

    // Look for existing chunk by (articleId + clauseRef in metadata).
    const existing = await KbChunk.findOne({
      articleId: article._id,
      "metadata.clauseRef": clause.clauseRef,
    }).lean();

    if (existing && existing.content === content) {
      chunksSkipped++;
      continue;
    }

    const embedRes = await AskHawkEmbeddingService.embedText(content);
    // embedText returns { vector, ... }; some providers may return the array directly.
    const embedding = Array.isArray(embedRes) ? embedRes : (embedRes?.vector || []);
    const norm = embedding.length ? Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)) : 0;
    const tokenCount = AskHawkEmbeddingService.tokenize(content).length;

    const payload = {
      tenantId: TENANT_KEY,
      role: "all",
      productArea: PRODUCT_AREA,
      tags: [...articleTags, `clause:${clause.clauseRef}`],
      articleId: article._id,
      chunkOrder: i,
      content,
      embedding,
      embeddingNorm: norm,
      embeddingProvider: AskHawkEmbeddingService.activeProviderName?.() || "deterministic_hash",
      embeddingModel: AskHawkEmbeddingService.activeModelName?.() || "",
      tokenCount,
      metadata: {
        standardKey: std.standardKey,
        clauseRef: clause.clauseRef,
        citationLabel: clause.citationLabel,
        clauseTitle: clause.title,
        jurisdiction: std.jurisdiction,
        version: std.version,
        kind: "regulatory_clause",
      },
    };

    if (existing) {
      await KbChunk.findByIdAndUpdate(existing._id, { $set: payload });
    } else {
      await KbChunk.create(payload);
    }
    chunksUpserted++;
  }
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Articles upserted: ${articlesUpserted}`);
console.log(`Chunks upserted:   ${chunksUpserted}`);
console.log(`Chunks unchanged:  ${chunksSkipped}`);
console.log(`──────────────────────────────────────────────`);

await mongoose.disconnect();
process.exit(0);
