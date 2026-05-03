/**
 * seed-sop-templates.mjs
 *
 * Loads src/data/sop-templates.json into the AskHawk knowledge base
 * (KbArticle + KbChunk) so the SOP-help mode can find templates +
 * generate citations like [SOP-EC-001 §3].
 *
 * Idempotent. One KbArticle per SOP, one KbChunk per section.
 *
 * Usage: node scripts/seed-sop-templates.mjs [--tenant-key __platform__]
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
const CORPUS = join(__dirname, "..", "src", "data", "sop-templates.json");

const SOURCE = "sop_template";
const PRODUCT_AREA = "sop_templates";

const tenantKeyArg = process.argv.find((a) => a.startsWith("--tenant-key="));
const TENANT_KEY = tenantKeyArg ? tenantKeyArg.split("=")[1] : "__platform__";

const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}\nTenant key: ${TENANT_KEY}`);

const data = JSON.parse(readFileSync(CORPUS, "utf-8"));
console.log(`Corpus version ${data.version} · ${data.templates.length} SOPs\n`);

let articles = 0, chunks = 0, skipped = 0;

for (const sop of data.templates) {
  const slug = `sop-${slugify(sop.sopKey)}`;
  const tags = ["sop", "sop_template", sop.sopKey, ...(sop.regulatoryAnchors || []).map(slugify)];

  const article = await KbArticle.findOneAndUpdate(
    { slug },
    {
      $set: {
        tenantId: TENANT_KEY,
        role: "all",
        productArea: PRODUCT_AREA,
        tags,
        title: `${sop.sopKey} — ${sop.title}`,
        slug,
        summary: sop.scope,
        source: SOURCE,
      },
    },
    { upsert: true, new: true }
  );
  articles++;
  console.log(`SOP: ${sop.sopKey.padEnd(14)} ${article._id}`);

  for (let i = 0; i < sop.sections.length; i++) {
    const sec = sop.sections[i];
    const sectionLabel = `${sop.sopKey} ${sec.sectionRef.split(/\s/)[0]}`; // "SOP-EC-001 1."
    const content = `${sop.sopKey} ${sec.sectionRef} — ${sop.title}\n\n${sec.text}`;

    const existing = await KbChunk.findOne({
      articleId: article._id,
      "metadata.sectionRef": sec.sectionRef,
    }).lean();
    if (existing && existing.content === content) { skipped++; continue; }

    const embedRes = await AskHawkEmbeddingService.embedText(content);
    const embedding = Array.isArray(embedRes) ? embedRes : (embedRes?.vector || []);
    const norm = embedding.length ? Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)) : 0;
    const tokenCount = AskHawkEmbeddingService.tokenize(content).length;

    const payload = {
      tenantId: TENANT_KEY,
      role: "all",
      productArea: PRODUCT_AREA,
      tags: [...tags, `section:${sec.sectionRef}`],
      articleId: article._id,
      chunkOrder: i,
      content,
      embedding,
      embeddingNorm: norm,
      embeddingProvider: AskHawkEmbeddingService.activeProviderName?.() || "deterministic_hash",
      embeddingModel: AskHawkEmbeddingService.activeModelName?.() || "",
      tokenCount,
      metadata: {
        sopKey: sop.sopKey,
        sopTitle: sop.title,
        sectionRef: sec.sectionRef,
        citationLabel: `${sop.sopKey} ${sec.sectionRef.split(/\s/)[0]}`,
        regulatoryAnchors: sop.regulatoryAnchors || [],
        kind: "sop_section",
      },
    };

    if (existing) await KbChunk.findByIdAndUpdate(existing._id, { $set: payload });
    else await KbChunk.create(payload);
    chunks++;
  }
}

console.log(`\n────────────────────────────────────────`);
console.log(`SOPs upserted:    ${articles}`);
console.log(`Sections seeded:  ${chunks}`);
console.log(`Sections skipped: ${skipped}`);
console.log(`────────────────────────────────────────`);

await mongoose.disconnect();
process.exit(0);
