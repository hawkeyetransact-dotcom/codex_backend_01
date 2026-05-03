/**
 * seed-workflow-playbooks.mjs
 *
 * Loads src/data/workflow-playbooks.json into the AskHawk knowledge base
 * (KbArticle + KbChunk) so the workflow_guide mode can answer
 * "as a [persona], how do I [task]?" with role-aware step-by-step
 * playbooks + deep-link buttons + regulatory anchors.
 *
 * Idempotent. One KbArticle per playbook (persona + workflow), one KbChunk
 * with the full playbook body.
 *
 * Usage: node scripts/seed-workflow-playbooks.mjs [--tenant-key __platform__]
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
const CORPUS = join(__dirname, "..", "src", "data", "workflow-playbooks.json");

const SOURCE = "workflow_playbook";
const PRODUCT_AREA = "workflow_guide";

const tenantKeyArg = process.argv.find((a) => a.startsWith("--tenant-key="));
const TENANT_KEY = tenantKeyArg ? tenantKeyArg.split("=")[1] : "__platform__";

const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}\nTenant key: ${TENANT_KEY}`);

const data = JSON.parse(readFileSync(CORPUS, "utf-8"));
console.log(`Corpus version ${data.version} · ${data.playbooks.length} playbooks\n`);

let articles = 0, chunks = 0, skipped = 0;
const personas = new Set();
const modules = new Set();

for (const pb of data.playbooks) {
  const slug = `pb-${slugify(pb.personaRole)}-${slugify(pb.module)}-${slugify(pb.title)}`;
  const tags = [
    "workflow_playbook",
    `persona:${slugify(pb.persona)}`,
    `role:${pb.personaRole}`,
    `module:${pb.module}`,
    ...(pb.triggers || []).map((t) => `trigger:${slugify(t)}`),
  ];
  personas.add(pb.persona);
  modules.add(pb.module);

  const article = await KbArticle.findOneAndUpdate(
    { slug },
    {
      $set: {
        tenantId: TENANT_KEY,
        // Role bias — frontend retrieval can filter by role to surface
        // playbooks for the user's persona first.
        role: pb.personaRole || "all",
        productArea: PRODUCT_AREA,
        tags,
        title: `${pb.persona}: ${pb.title}`,
        slug,
        summary: pb.summary,
        source: SOURCE,
      },
    },
    { upsert: true, new: true }
  );
  articles++;

  // Compose the playbook content as a single KbChunk — the steps are tightly
  // coupled so chunking would lose context.
  const stepsBlock = (pb.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
  const linksBlock = (pb.deepLinks || []).map((l) => `→ ${l.label}: ${l.href}`).join("\n");
  const regs = (pb.regulatoryAnchors || []).join(" · ");
  const triggersBlock = (pb.triggers || []).join(" · ");
  const content = [
    `**${pb.persona} — ${pb.title}**`,
    pb.summary,
    "",
    "Steps:",
    stepsBlock,
    linksBlock ? `\nQuick links:\n${linksBlock}` : "",
    regs ? `\nRegulatory: ${regs}` : "",
    triggersBlock ? `\nKeywords: ${triggersBlock}` : "",
  ].filter(Boolean).join("\n");

  const existing = await KbChunk.findOne({
    articleId: article._id,
    "metadata.kind": "workflow_playbook",
  }).lean();
  if (existing && existing.content === content) { skipped++; continue; }

  const embedRes = await AskHawkEmbeddingService.embedText(content);
  const embedding = Array.isArray(embedRes) ? embedRes : (embedRes?.vector || []);
  const norm = embedding.length ? Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)) : 0;
  const tokenCount = AskHawkEmbeddingService.tokenize(content).length;

  const payload = {
    tenantId: TENANT_KEY,
    role: pb.personaRole || "all",
    productArea: PRODUCT_AREA,
    tags,
    articleId: article._id,
    chunkOrder: 0,
    content,
    embedding,
    embeddingNorm: norm,
    embeddingProvider: AskHawkEmbeddingService.activeProviderName?.() || "deterministic_hash",
    embeddingModel: AskHawkEmbeddingService.activeModelName?.() || "",
    tokenCount,
    metadata: {
      kind: "workflow_playbook",
      persona: pb.persona,
      personaRole: pb.personaRole,
      module: pb.module,
      title: pb.title,
      triggers: pb.triggers || [],
      deepLinks: pb.deepLinks || [],
      regulatoryAnchors: pb.regulatoryAnchors || [],
      citationLabel: `Playbook · ${pb.persona} · ${pb.title}`,
    },
  };

  if (existing) await KbChunk.findByIdAndUpdate(existing._id, { $set: payload });
  else await KbChunk.create(payload);
  chunks++;
}

console.log(`Personas covered:  ${personas.size}  (${[...personas].join(', ')})`);
console.log(`Modules covered:   ${modules.size}  (${[...modules].join(', ')})`);
console.log(`────────────────────────────────────────`);
console.log(`Playbooks upserted:  ${articles}`);
console.log(`Chunks seeded:       ${chunks}`);
console.log(`Chunks skipped:      ${skipped}`);
console.log(`────────────────────────────────────────`);

await mongoose.disconnect();
process.exit(0);
