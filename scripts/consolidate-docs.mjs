/**
 * Doc consolidation + versioning — idempotent.
 *
 *   1. For every .md under backend/docs: ensure a YAML frontmatter block
 *      with { doc, version, updated, owner, category, status }.
 *   2. For every .html under backend/docs: ensure <meta name="doc-*"> tags
 *      in <head>.
 *   3. Generate INDEX.md (master catalog) + VERSIONS.md (changelog stub).
 *
 * Running twice is safe — existing frontmatter is preserved; only the
 * `updated` field refreshes if `--bump` is passed.
 *
 * Usage:
 *   node scripts/consolidate-docs.mjs                # insert-only (preserve existing version)
 *   node scripts/consolidate-docs.mjs --bump         # also bump updated dates
 */
import { fileURLToPath } from "url";
import { dirname, join, relative, basename, extname } from "path";
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS = join(__dirname, "..", "docs");
const TODAY = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const bump = args.includes("--bump");

// Known category map: numbered folder → human label
const CATEGORY = {
  "01-architecture": "architecture",
  "02-deployment": "deployment",
  "03-user-guides": "user-guides",
  "04-processes": "processes",
  "05-compliance": "compliance",
  "06-roadmap": "roadmap",
  "07-marketing": "marketing",
  "08-reference": "reference",
  "09-test-reports": "test-reports",
  askhawk: "askhawk",
  capa: "capa",
  "doc-intel": "doc-intel",
  "eqms-intelligence": "eqms-intelligence",
  "marketplace-v2": "marketplace",
  "org-directory": "org-directory",
  "platform-docs": "platform-docs",
  reference: "reference",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(md|html)$/i.test(name)) out.push(full);
  }
  return out;
}

function categoryFor(absPath) {
  const rel = relative(DOCS, absPath).replace(/\\/g, "/");
  const first = rel.split("/")[0];
  return CATEGORY[first] || "other";
}

function docKeyFrom(absPath) {
  return basename(absPath).replace(/\.[^.]+$/, "");
}

function parseMdFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { fm: null, body: content };
  const raw = m[1];
  const fm = {};
  for (const line of raw.split("\n")) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: content.slice(m[0].length) };
}

function stringifyFm(fm) {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function ensureMdFrontmatter(absPath) {
  const content = readFileSync(absPath, "utf8");
  const { fm, body } = parseMdFrontmatter(content);
  const existing = fm || {};
  const next = {
    doc: existing.doc || docKeyFrom(absPath),
    version: existing.version || "1.0",
    updated: bump || !existing.updated ? TODAY : existing.updated,
    owner: existing.owner || "Hawkeye Platform",
    category: existing.category || categoryFor(absPath),
    status: existing.status || "current",
  };
  // Preserve any extra fields from existing.
  for (const [k, v] of Object.entries(existing)) {
    if (!(k in next)) next[k] = v;
  }
  const out = stringifyFm(next) + body.replace(/^\n+/, "");
  if (out !== content) writeFileSync(absPath, out);
  return next;
}

function ensureHtmlMeta(absPath) {
  let content = readFileSync(absPath, "utf8");
  const key = docKeyFrom(absPath);
  const category = categoryFor(absPath);
  // Extract existing meta if present.
  const existingVersionMatch = content.match(/<meta\s+name=["']doc-version["']\s+content=["']([^"']+)["']\s*\/?>/i);
  const version = existingVersionMatch ? existingVersionMatch[1] : "1.0";
  const existingUpdatedMatch = content.match(/<meta\s+name=["']doc-updated["']\s+content=["']([^"']+)["']\s*\/?>/i);
  const updated = (bump || !existingUpdatedMatch) ? TODAY : existingUpdatedMatch[1];

  const block =
    `<meta name="doc" content="${key}">\n` +
    `<meta name="doc-version" content="${version}">\n` +
    `<meta name="doc-updated" content="${updated}">\n` +
    `<meta name="doc-owner" content="Hawkeye Platform">\n` +
    `<meta name="doc-category" content="${category}">\n` +
    `<meta name="doc-status" content="current">`;

  // Strip existing doc-* meta tags.
  content = content.replace(/\s*<meta\s+name=["']doc[-a-z]*["'][^>]*>\s*/gi, "");

  // Inject immediately after <head> (or before </head> if <head> on same line).
  if (/<head[^>]*>/i.test(content)) {
    content = content.replace(/(<head[^>]*>)/i, `$1\n${block}`);
  } else {
    // No head tag (unlikely) — prepend a comment block.
    content = `<!--\n${block.replace(/<meta[^>]*>/g, (m) => m)}\n-->\n` + content;
  }
  writeFileSync(absPath, content);
  return { version, updated, category, key };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

const files = walk(DOCS);
const rows = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  const rel = relative(DOCS, f).replace(/\\/g, "/");
  if (ext === ".md") {
    const fm = ensureMdFrontmatter(f);
    rows.push({
      doc: fm.doc, version: fm.version, updated: fm.updated, category: fm.category, status: fm.status,
      path: rel, type: "md",
    });
  } else if (ext === ".html") {
    const m = ensureHtmlMeta(f);
    rows.push({
      doc: m.key, version: m.version, updated: m.updated, category: m.category, status: "current",
      path: rel, type: "html",
    });
  }
}

// Sort for stable INDEX ordering.
rows.sort((a, b) => (a.category + a.doc).localeCompare(b.category + b.doc));

// ─── INDEX.md ──────────────────────────────────────────────────────────────
const byCat = new Map();
for (const r of rows) {
  if (!byCat.has(r.category)) byCat.set(r.category, []);
  byCat.get(r.category).push(r);
}

const CAT_ORDER = [
  "architecture",
  "deployment",
  "user-guides",
  "processes",
  "compliance",
  "roadmap",
  "marketing",
  "reference",
  "test-reports",
  "askhawk",
  "capa",
  "doc-intel",
  "eqms-intelligence",
  "marketplace",
  "org-directory",
  "platform-docs",
  "other",
];

let indexMd =
  `# Hawkeye Documentation — Master Index\n\n` +
  `> Canonical location: \`backend/docs/\`. This is the ONLY source of truth for platform documentation.\n\n` +
  `- **${rows.length}** documents across **${byCat.size}** categories\n` +
  `- **Last generated:** ${TODAY}\n` +
  `- **Versioning:** every file carries YAML frontmatter (md) or \`<meta name="doc-*">\` tags (html)\n` +
  `- **Regenerate:** \`cd backend && node scripts/consolidate-docs.mjs [--bump]\`\n\n` +
  `See also: [\`VERSIONS.md\`](./VERSIONS.md) for the changelog.\n\n`;

for (const cat of CAT_ORDER) {
  const items = byCat.get(cat);
  if (!items || !items.length) continue;
  indexMd += `## ${cat} (${items.length})\n\n`;
  indexMd += `| doc | path | version | updated | type |\n`;
  indexMd += `|---|---|---|---|---|\n`;
  for (const r of items) {
    indexMd += `| \`${r.doc}\` | [${r.path}](./${r.path}) | ${r.version} | ${r.updated} | ${r.type} |\n`;
  }
  indexMd += `\n`;
}

writeFileSync(join(DOCS, "INDEX.md"), indexMd);

// ─── VERSIONS.md ───────────────────────────────────────────────────────────
// Append-only changelog — header stays on top, newest entry added just below it.
const versionsPath = join(DOCS, "VERSIONS.md");
const HEADER = `# Documentation Versions — Changelog\n\nAppend-only log of doc set changes. Newest entry on top.\n\n---\n\n`;
let versions;
try { versions = readFileSync(versionsPath, "utf8"); } catch { versions = HEADER; }
if (!versions.startsWith("# Documentation Versions")) versions = HEADER + versions;

const alreadyToday = versions.includes(`## ${TODAY}`);
if (!alreadyToday) {
  const entry =
    `## ${TODAY}\n\n` +
    `- Consolidated \`backend/docs/\`: removed 20 root-level duplicates.\n` +
    `- Retired \`frontend/docs/\`: moved unique content into \`backend/docs/08-reference/\`; deleted the rest (15 duplicate files).\n` +
    `- Added YAML frontmatter to all \`.md\` docs and \`<meta name="doc-*">\` tags to all HTML docs.\n` +
    `- Generated master [\`INDEX.md\`](./INDEX.md) as single source of truth.\n` +
    `- **${rows.length} docs currently indexed.**\n\n` +
    `---\n\n`;
  // Insert the entry after the HEADER block.
  const headerRegex = /(^# Documentation Versions — Changelog\n\nAppend-only log of doc set changes\. Newest entry on top\.\n\n---\n\n)/;
  versions = versions.replace(headerRegex, `$1${entry}`);
  writeFileSync(versionsPath, versions);
}

console.log(`✓ updated frontmatter/meta on ${rows.length} files`);
console.log(`✓ wrote INDEX.md (${byCat.size} categories)`);
console.log(`✓ ${alreadyToday ? "VERSIONS.md already has today's entry" : "appended today's entry to VERSIONS.md"}`);
