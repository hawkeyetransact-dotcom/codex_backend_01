import fs from "fs/promises";
import path from "path";
import KbArticle from "../models/kbArticleModel.js";
import KbChunk from "../models/kbChunkModel.js";
import { AskHawkEmbeddingService } from "./askHawkEmbeddingService.js";

export const LOCAL_KB_SOURCE = "codebase_auto_v2";
export const LOCAL_KB_PRODUCT_AREA = "application_reference";

const INDEX_TTL_MS = Number(process.env.ASKHAWK_INDEX_TTL_MS || 5 * 60 * 1000);
const MAX_FILE_SIZE_BYTES = Number(process.env.ASKHAWK_MAX_FILE_SIZE_BYTES || 350_000);
const MAX_FILES = Number(process.env.ASKHAWK_MAX_FILES || 900);
const MAX_WINDOWS_PER_FILE = Number(process.env.ASKHAWK_WINDOWS_PER_FILE || 7);
const WINDOW_LINES = Number(process.env.ASKHAWK_WINDOW_LINES || 20);
const WINDOW_STEP = Number(process.env.ASKHAWK_WINDOW_STEP || 12);

const ALLOWED_EXT = new Set([
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  "uploads",
  "tmp",
  "temp",
  ".turbo",
  ".vercel",
  "__tests__",
  "e2e",
]);

const EXCLUDED_FILE_SUFFIXES = new Set([
  "src/controllers/askHawkController.js",
  "src/services/askHawkKnowledgeService.js",
]);

const DOMAIN_TERMS = [
  "audit",
  "auditor",
  "buyer",
  "supplier",
  "questionnaire",
  "artifact",
  "intimation",
  "agenda",
  "scope",
  "milestone",
  "planning",
  "preparation",
  "digilocker",
  "compliance",
  "capa",
  "tracking",
  "notification",
  "template",
  "report",
  "evidence",
  "workflow",
  "rfq",
  "assignment",
];

const SIGNAL_PATTERNS = [
  /router\.(get|post|put|patch|delete)\s*\(/i,
  /app\.use\s*\(/i,
  /nextApi\.(get|post|put|patch|delete)\s*\(/i,
  /axiosInstance\.(get|post|put|patch|delete)\s*\(/i,
  /fetch\s*\(/i,
  /\/api\//i,
  /export\s+const\s+\w+/i,
  /export\s+default\s+function/i,
  /mongoose\.model\s*\(/i,
  /schema\s*=\s*new\s+mongoose\.Schema/i,
];

const normalizeText = (text = "") => AskHawkEmbeddingService.normalizeText(text);
const tokenize = (text = "") => AskHawkEmbeddingService.tokenize(text);
const vectorize = (text = "") => AskHawkEmbeddingService.lexicalVector(text);
const cosine = (a = {}, b = {}) => AskHawkEmbeddingService.lexicalCosine(a, b);

const toPosix = (value = "") => String(value || "").split(path.sep).join("/");

const safeStat = async (targetPath) => {
  try {
    return await fs.stat(targetPath);
  } catch (_err) {
    return null;
  }
};

const unique = (items = []) => [...new Set(items.filter(Boolean))];

const normalizeRoutePath = (base = "", tail = "") => {
  const merged = `${base || ""}/${tail || ""}`.replace(/\/+/g, "/");
  return merged.startsWith("/") ? merged : `/${merged}`;
};

const cleanCodeLine = (line = "") => {
  const trimmed = String(line || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ").trim();
};

const shouldSkipLine = (line = "") => {
  const lc = String(line || "").trim().toLowerCase();
  if (!lc) return true;
  if (lc.startsWith("import ")) return true;
  if (lc.startsWith("export default") && lc.length < 30) return true;
  if (lc === "{" || lc === "}" || lc === "];" || lc === "});") return true;
  return false;
};

const isHumanReadableLine = (line = "") => {
  const text = cleanCodeLine(line);
  if (!text || text.length < 14) return false;
  const symbolCount = (text.match(/[{}()[\];=><]/g) || []).length;
  const ratio = symbolCount / Math.max(text.length, 1);
  if (ratio > 0.08) return false;
  return true;
};

const inferProductArea = (pathText = "", contentText = "") => {
  const haystack = `${pathText} ${contentText}`.toLowerCase();
  if (/digilocker|docintel|document/.test(haystack)) return "document_intelligence";
  if (/capa|issue|observation/.test(haystack)) return "capa_management";
  if (/compliance|cfr|standard/.test(haystack)) return "compliance";
  if (/schedule|milestone|timeline|tracking/.test(haystack)) return "timeline_and_tracking";
  if (/template|questionnaire|artifact|intimation|agenda|scope/.test(haystack)) return "questionnaire_and_artifacts";
  if (/report/.test(haystack)) return "reporting";
  if (/rfq/.test(haystack)) return "rfq";
  return LOCAL_KB_PRODUCT_AREA;
};

const inferTags = (pathText = "", contentText = "") => {
  const haystack = `${pathText} ${contentText}`.toLowerCase();
  const tags = DOMAIN_TERMS.filter((term) => haystack.includes(term));
  const base = tokenize(pathText).filter((t) => t.length >= 4);
  return unique([...tags, ...base]).slice(0, 18);
};

const extractFrontendRoute = (relativePath = "") => {
  const rel = toPosix(relativePath);
  if (!rel.startsWith("app/")) return null;
  if (!/\/(page|route)\.(tsx|ts|jsx|js)$/.test(rel)) return null;
  const noApp = rel.replace(/^app\//, "");
  const noFile = noApp.replace(/\/(page|route)\.(tsx|ts|jsx|js)$/, "");
  const segments = noFile
    .split("/")
    .filter(Boolean)
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")));
  if (!segments.length) return "/";
  return `/${segments.join("/")}`;
};

const extractApiCalls = (raw = "") => {
  const calls = [];
  const rex = /(nextApi|axiosInstance|axios)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match = rex.exec(raw);
  while (match) {
    calls.push(`${match[2].toUpperCase()} ${match[3]}`);
    match = rex.exec(raw);
  }
  const fetchRex = /fetch\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{\s*method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]/gi;
  match = fetchRex.exec(raw);
  while (match) {
    calls.push(`${String(match[2]).toUpperCase()} ${match[1]}`);
    match = fetchRex.exec(raw);
  }
  return unique(calls).slice(0, 20);
};

const extractBackendEndpoints = (raw = "", mountPrefix = "") => {
  const endpoints = [];
  const routeRex = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match = routeRex.exec(raw);
  while (match) {
    const method = String(match[1] || "").toUpperCase();
    const localPath = match[2] || "";
    endpoints.push(`${method} ${normalizeRoutePath(mountPrefix, localPath)}`);
    match = routeRex.exec(raw);
  }
  return unique(endpoints).slice(0, 40);
};

const extractExportedSymbols = (raw = "") => {
  const symbols = [];
  const constRex = /export\s+const\s+([a-zA-Z0-9_]+)/g;
  let match = constRex.exec(raw);
  while (match) {
    symbols.push(match[1]);
    match = constRex.exec(raw);
  }
  const functionRex = /export\s+async\s+function\s+([a-zA-Z0-9_]+)/g;
  match = functionRex.exec(raw);
  while (match) {
    symbols.push(match[1]);
    match = functionRex.exec(raw);
  }
  return unique(symbols).slice(0, 20);
};

const extractModelNames = (raw = "") => {
  const names = [];
  const modelRex = /mongoose\.model\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match = modelRex.exec(raw);
  while (match) {
    names.push(match[1]);
    match = modelRex.exec(raw);
  }
  return unique(names).slice(0, 10);
};

const scoreWindow = (windowText = "") => {
  const lower = windowText.toLowerCase();
  let score = 0;
  SIGNAL_PATTERNS.forEach((pattern) => {
    if (pattern.test(windowText)) score += 1.5;
  });
  DOMAIN_TERMS.forEach((term) => {
    if (lower.includes(term)) score += 0.35;
  });
  if (lower.includes("screen:")) score += 1;
  if (lower.includes("endpoint:")) score += 1;
  if (lower.includes("calls api:")) score += 1;
  const nonEmpty = windowText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  score += Math.min(nonEmpty * 0.03, 0.9);
  return score;
};

const buildSignalWindows = (raw = "") => {
  const lines = String(raw || "").replace(/\r/g, "").split("\n");
  if (!lines.length) return [];
  const windows = [];
  for (let idx = 0; idx < lines.length; idx += WINDOW_STEP) {
    const slice = lines.slice(idx, idx + WINDOW_LINES);
    const cleaned = slice.map(cleanCodeLine).filter((line) => !shouldSkipLine(line));
    if (!cleaned.length) continue;
    const text = cleaned.join("\n");
    if (text.length < 80) continue;
    windows.push({
      lineStart: idx + 1,
      lineEnd: idx + slice.length,
      content: text.slice(0, 1700),
      signal: scoreWindow(text),
    });
  }
  if (!windows.length) return [];

  const selected = [];
  const bySignal = [...windows].sort((a, b) => b.signal - a.signal || a.lineStart - b.lineStart);
  bySignal.forEach((win) => {
    if (selected.length >= MAX_WINDOWS_PER_FILE) return;
    const overlaps = selected.some((picked) => Math.abs(picked.lineStart - win.lineStart) < WINDOW_LINES / 2);
    if (!overlaps) selected.push(win);
  });
  return selected.sort((a, b) => a.lineStart - b.lineStart);
};

const toChunkRecord = ({
  source,
  articleKey,
  title,
  slug,
  productArea,
  tags,
  repo,
  filePath,
  kind,
  lineStart,
  lineEnd,
  content,
  meta,
}) => {
  const normalizedContent = normalizeText(content);
  return {
    source,
    articleKey,
    title,
    slug,
    productArea,
    tags: tags || [],
    repo,
    filePath,
    kind,
    lineStart,
    lineEnd,
    content,
    normalizedContent,
    vector: vectorize(normalizedContent),
    pathTokens: new Set(tokenize(filePath)),
    meta: meta || {},
    citation:
      lineStart && lineEnd
        ? `${repo}/${filePath}:${lineStart}`
        : `${repo}/${filePath}`,
  };
};

const stableHash = (value = "") => {
  let hash = 0;
  const str = String(value || "");
  for (let idx = 0; idx < str.length; idx += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(idx);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const routeMountMapFromApp = async (backendRoot) => {
  const appPath = path.join(backendRoot, "src", "app.js");
  const stat = await safeStat(appPath);
  if (!stat?.isFile()) return {};
  const raw = await fs.readFile(appPath, "utf8");
  const importMap = {};
  const importRex = /import\s+([a-zA-Z0-9_]+)\s+from\s+["']\.\/routes\/([^"']+)["'];/g;
  let match = importRex.exec(raw);
  while (match) {
    importMap[match[1]] = `src/routes/${toPosix(match[2])}`;
    match = importRex.exec(raw);
  }
  const out = {};
  const useRex = /app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([a-zA-Z0-9_]+)\s*\)/g;
  match = useRex.exec(raw);
  while (match) {
    const prefix = match[1];
    const varName = match[2];
    const rel = importMap[varName];
    if (rel) out[rel] = prefix;
    match = useRex.exec(raw);
  }
  return out;
};

const walkDirectory = async (baseRoot, absoluteDir, out = []) => {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry || !entry.name) continue;
    if (entry.name.startsWith(".") && ![".env.example"].includes(entry.name)) continue;
    const abs = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkDirectory(baseRoot, abs, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    const stat = await safeStat(abs);
    if (!stat?.isFile()) continue;
    if (stat.size > MAX_FILE_SIZE_BYTES) continue;
    const relPath = toPosix(path.relative(baseRoot, abs));
    out.push({ absPath: abs, relPath, size: stat.size });
  }
  return out;
};

const collectCandidateFiles = async () => {
  const backendRoot = process.cwd();
  const frontendRoot = path.resolve(backendRoot, "..", "frontend");
  const plans = [
    {
      repo: "backend",
      root: backendRoot,
      includes: ["src/routes", "src/controllers", "src/services", "src/models", "src/modules", "docs", "README.md"],
    },
    {
      repo: "frontend",
      root: frontendRoot,
      includes: ["app", "components", "lib", "README.md"],
    },
  ];

  const files = [];
  for (const plan of plans) {
    const rootStat = await safeStat(plan.root);
    if (!rootStat?.isDirectory()) continue;
    for (const includePath of plan.includes) {
      const abs = path.join(plan.root, includePath);
      const stat = await safeStat(abs);
      if (!stat) continue;
      if (stat.isDirectory()) {
        const nested = await walkDirectory(plan.root, abs, []);
        nested.forEach((entry) => files.push({ ...entry, repo: plan.repo, repoRoot: plan.root }));
      } else if (stat.isFile()) {
        const ext = path.extname(includePath).toLowerCase();
        if (includePath.toLowerCase() === "readme.md" || ALLOWED_EXT.has(ext)) {
          files.push({
            repo: plan.repo,
            repoRoot: plan.root,
            relPath: toPosix(includePath),
            absPath: abs,
            size: stat.size,
          });
        }
      }
    }
  }

  return files
    .filter((entry) => !EXCLUDED_FILE_SUFFIXES.has(toPosix(entry.relPath)))
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .slice(0, MAX_FILES);
};

const toFacts = ({ repo, relPath, raw, mountPrefix }) => {
  const facts = [];
  const exports = extractExportedSymbols(raw);
  if (exports.length) facts.push(`Exports: ${exports.join(", ")}`);

  if (repo === "frontend") {
    const route = extractFrontendRoute(relPath);
    if (route) facts.push(`Screen: ${route}`);
    const apiCalls = extractApiCalls(raw);
    apiCalls.forEach((api) => facts.push(`Calls API: ${api}`));
    return {
      facts,
      meta: {
        screenRoute: route || null,
        apiCalls,
        endpoints: [],
        models: [],
      },
    };
  }

  const endpoints = relPath.includes("routes/")
    ? extractBackendEndpoints(raw, mountPrefix || "")
    : [];
  endpoints.forEach((ep) => facts.push(`Endpoint: ${ep}`));

  const models = relPath.includes("models/")
    ? extractModelNames(raw)
    : [];
  models.forEach((name) => facts.push(`Model: ${name}`));

  const apiCalls = extractApiCalls(raw);
  apiCalls.forEach((api) => facts.push(`Calls API: ${api}`));

  return {
    facts,
    meta: {
      screenRoute: null,
      apiCalls,
      endpoints,
      models,
    },
  };
};

const titleFromPath = (repo, relPath) => {
  const base = path.basename(relPath).replace(/\.[^.]+$/, "");
  const words = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  const suffix = repo === "frontend" ? "UI" : "Backend";
  return `${words.join(" ")} (${suffix})`;
};

const buildDocEntry = ({ repo, relPath, raw, mountPrefix }) => {
  const filePath = toPosix(relPath);
  const productArea = inferProductArea(filePath, raw.slice(0, 2400));
  const tags = inferTags(filePath, raw.slice(0, 2400));
  const title = titleFromPath(repo, filePath);
  const slug = `code-${repo}-${stableHash(filePath)}`;

  const { facts, meta } = toFacts({ repo, relPath: filePath, raw, mountPrefix });
  const chunks = [];
  if (facts.length) {
    chunks.push(
      toChunkRecord({
        source: "local_code",
        articleKey: `${repo}/${filePath}`,
        title,
        slug,
        productArea,
        tags,
        repo,
        filePath,
        kind: "facts",
        lineStart: 1,
        lineEnd: Math.min(facts.length + 1, 50),
        content: `Facts\n${facts.map((f) => `- ${f}`).join("\n")}`,
        meta,
      })
    );
  }

  const windows = buildSignalWindows(raw);
  windows.forEach((window) => {
    chunks.push(
      toChunkRecord({
        source: "local_code",
        articleKey: `${repo}/${filePath}`,
        title,
        slug,
        productArea,
        tags,
        repo,
        filePath,
        kind: "source",
        lineStart: window.lineStart,
        lineEnd: window.lineEnd,
        content: window.content,
        meta,
      })
    );
  });

  const summary = facts.length
    ? facts.slice(0, 3).join(" | ")
    : `Code reference from ${repo}/${filePath}`;

  return {
    source: "local_code",
    repo,
    filePath,
    articleKey: `${repo}/${filePath}`,
    title,
    slug,
    productArea,
    tags,
    summary,
    facts,
    meta,
    chunks,
  };
};

export const buildKnowledgeIndexFromDocuments = (docs = []) => {
  const chunks = [];
  docs.forEach((doc) => {
    (doc?.chunks || []).forEach((chunk) => chunks.push(chunk));
  });
  return {
    builtAt: Date.now(),
    docs,
    chunks,
    stats: {
      docs: docs.length,
      chunks: chunks.length,
    },
  };
};

const boostForPathAndTags = (queryTokens = [], item) => {
  const pathTokenMatches = queryTokens.filter((token) => item.pathTokens?.has(token)).length;
  const tagMatches = queryTokens.filter((token) => (item.tags || []).includes(token)).length;
  return pathTokenMatches * 0.06 + tagMatches * 0.08;
};

const phraseBoost = (normalizedQuery = "", normalizedContent = "") => {
  if (!normalizedQuery || normalizedQuery.length < 7) return 0;
  if (!normalizedContent) return 0;
  if (normalizedContent.includes(normalizedQuery)) return 0.5;
  const terms = normalizedQuery.split(" ").filter((t) => t.length >= 4);
  const matchCount = terms.filter((term) => normalizedContent.includes(term)).length;
  return Math.min(matchCount * 0.05, 0.25);
};

export const searchInKnowledgeIndex = (
  index,
  { query, productArea, limit = 8, minScore = 0.12 } = {}
) => {
  const normalizedQuery = normalizeText(query || "");
  const queryTokens = tokenize(normalizedQuery);
  if (!queryTokens.length || !index?.chunks?.length) return [];
  const queryVec = vectorize(normalizedQuery);

  const scored = [];
  for (const chunk of index.chunks) {
    if (productArea && chunk.productArea && productArea !== chunk.productArea) {
      if (chunk.productArea !== LOCAL_KB_PRODUCT_AREA) continue;
    }
    const lexical = cosine(queryVec, chunk.vector);
    const boosts = boostForPathAndTags(queryTokens, chunk);
    const phrase = phraseBoost(normalizedQuery, chunk.normalizedContent);
    const factsBonus = chunk.kind === "facts" ? 0.12 : 0;
    const score = lexical + boosts + phrase + factsBonus;
    if (score >= minScore) {
      scored.push({
        source: "local_code",
        score,
        content: chunk.content,
        chunkOrder: chunk.lineStart || 0,
        article: {
          title: chunk.title,
          slug: chunk.slug,
        },
        productArea: chunk.productArea,
        tags: chunk.tags || [],
        citation: chunk.citation,
        kind: chunk.kind,
        repo: chunk.repo,
        filePath: chunk.filePath,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        meta: chunk.meta || {},
      });
    }
  }

  const dedup = new Map();
  const perFileCount = new Map();
  scored
    .sort((a, b) => b.score - a.score)
    .forEach((item) => {
      const key = `${item.citation}:${item.kind}`;
      if (dedup.has(key) || dedup.size >= limit * 3) return;
      const fileKey = `${item.repo}/${item.filePath}`;
      const count = perFileCount.get(fileKey) || 0;
      if (count >= 2) return;
      perFileCount.set(fileKey, count + 1);
      dedup.set(key, item);
    });

  return [...dedup.values()].sort((a, b) => b.score - a.score).slice(0, limit);
};

const rankDocsForSync = (docs = []) => {
  const priority = (doc) => {
    const rel = `${doc.repo}/${doc.filePath}`.toLowerCase();
    if (rel.includes("app/") && rel.endsWith("page.tsx")) return 1;
    if (rel.includes("/routes/")) return 2;
    if (rel.includes("/controllers/")) return 3;
    if (rel.includes("/services/")) return 4;
    if (rel.endsWith("readme.md")) return 5;
    return 8;
  };
  return [...docs].sort((a, b) => priority(a) - priority(b) || a.filePath.localeCompare(b.filePath));
};

const toDbSlug = (tenantId, role, filePath) =>
  `askhawk-${LOCAL_KB_SOURCE}-${stableHash(`${tenantId}|${role}|${filePath}`)}`;

export const syncKnowledgeIndexToTenantKb = async ({
  tenantId,
  role,
  productArea = LOCAL_KB_PRODUCT_AREA,
  maxArticles = 280,
  maxChunksPerArticle = 6,
} = {}) => {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  const index = await getKnowledgeIndex();
  const docs = rankDocsForSync(index.docs || [])
    .filter((doc) => !productArea || doc.productArea === productArea || productArea === LOCAL_KB_PRODUCT_AREA)
    .slice(0, maxArticles);

  const existing = await KbArticle.find({
    tenantId,
    role,
    source: LOCAL_KB_SOURCE,
  })
    .select("_id")
    .lean();
  const existingIds = existing.map((item) => item._id);
  if (existingIds.length) {
    await KbChunk.deleteMany({ articleId: { $in: existingIds } });
    await KbArticle.deleteMany({ _id: { $in: existingIds } });
  }

  let insertedArticles = 0;
  let insertedChunks = 0;
  for (const doc of docs) {
    const article = await KbArticle.create({
      tenantId,
      role,
      productArea: doc.productArea || LOCAL_KB_PRODUCT_AREA,
      tags: doc.tags || [],
      title: doc.title,
      slug: toDbSlug(tenantId, role, `${doc.repo}/${doc.filePath}`),
      summary: doc.summary,
      source: LOCAL_KB_SOURCE,
    });
    insertedArticles += 1;
    const scopedChunks = (doc.chunks || []).slice(0, maxChunksPerArticle);
    const chunks = [];
    for (let indexNo = 0; indexNo < scopedChunks.length; indexNo += 1) {
      const chunk = scopedChunks[indexNo];
      const embedded = await AskHawkEmbeddingService.embedText(chunk.content || "");
      chunks.push({
        tenantId,
        role,
        productArea: doc.productArea || LOCAL_KB_PRODUCT_AREA,
        tags: doc.tags || [],
        articleId: article._id,
        chunkOrder: indexNo,
        content: chunk.content,
        embedding: embedded.vector || [],
        embeddingNorm: Number(embedded.norm || 0),
        embeddingProvider: embedded.provider || "deterministic_hash",
        embeddingModel: embedded.model || "",
        tokenCount: Number(embedded.tokenCount || 0),
        metadata: {
          source: chunk.source || doc.source || "local_code",
          citation: chunk.citation || `${doc.repo}/${doc.filePath}`,
          repo: chunk.repo || doc.repo || "",
          filePath: chunk.filePath || doc.filePath || "",
          kind: chunk.kind || "source",
          lineStart: Number(chunk.lineStart || 0),
          lineEnd: Number(chunk.lineEnd || 0),
        },
      });
    }
    if (chunks.length) {
      await KbChunk.insertMany(chunks);
      insertedChunks += chunks.length;
    }
  }

  return {
    tenantId,
    role,
    source: LOCAL_KB_SOURCE,
    articles: insertedArticles,
    chunks: insertedChunks,
  };
};

const extractHighlights = (hits = []) => {
  const strongFacts = [];
  const highlights = [];
  for (const hit of hits) {
    const lines = String(hit.content || "")
      .split("\n")
      .map(cleanCodeLine)
      .filter((line) => line && !shouldSkipLine(line));
    for (const line of lines) {
      const cleaned = line.replace(/^-\s*/, "").trim();
      if (/^(Screen:|Endpoint:|Calls API:|Model:|Exports:)/i.test(cleaned)) {
        if (cleaned.length >= 12 && cleaned.length <= 220) strongFacts.push(cleaned);
        continue;
      }
      if (
        /(assign|submit|review|generate|select|upload|edit|save|finalize|complete|approve|schedule|prepare|artifact|questionnaire|template)/i.test(
          cleaned
        ) &&
        isHumanReadableLine(cleaned) &&
        !/[{}()[\];=><`$]/.test(cleaned) &&
        cleaned.split(/\s+/).length >= 4
      ) {
        if (cleaned.length >= 16 && cleaned.length <= 220) highlights.push(cleaned);
      }
      if (strongFacts.length + highlights.length >= 18) break;
    }
    if (strongFacts.length + highlights.length >= 18) break;
  }
  return unique([...strongFacts, ...highlights]).slice(0, 10);
};

const inferActionHints = (question = "") => {
  const lc = String(question || "").toLowerCase();
  const actions = [];
  if (/status|progress|overdue|milestone|timeline/.test(lc)) {
    actions.push("getQuestionnaireProgress", "getTimelineMilestones");
  }
  if (/capa|issue/.test(lc)) actions.push("listOpenCapas");
  if (/audit|request/.test(lc)) actions.push("listAuditRequests");
  return unique(actions).slice(0, 3);
};

const ACTION_VERB_PATTERN =
  /\b(open|go|navigate|select|choose|click|upload|run|review|fill|submit|create|download|assign|save|clear|generate|send|map|attach|trigger)\b/i;

const toSentence = (text = "") => {
  const cleaned = String(text || "")
    .replace(/^[-*\d.\s]+/, "")
    .replace(/^Screen:\s*/i, "")
    .replace(/^Endpoint:\s*/i, "")
    .replace(/^Calls API:\s*/i, "")
    .replace(/^Model:\s*/i, "")
    .replace(/^Exports:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[`"'{}()[\]<>;$]/g, "")
    .trim();
  if (!cleaned) return "";
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

const shouldUseAsWorkflowStep = (line = "") => {
  const text = cleanCodeLine(line);
  if (!text) return false;
  if (text.length < 12 || text.length > 200) return false;
  if (/\/api\/|router\.|nextApi\.|axios|function|const|=>|return\s/.test(text)) return false;
  if (!ACTION_VERB_PATTERN.test(text)) return false;
  return true;
};

const routeToLabel = (route = "") =>
  String(route || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[-_]+/g, " ").trim())
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const inferRoleHint = (question = "") => {
  const q = String(question || "").toLowerCase();
  if (/\bbuyer\b/.test(q)) return "buyer";
  if (/\bsupplier\b/.test(q)) return "supplier";
  if (/\bauditor\b/.test(q)) return "auditor";
  if (/\badmin\b/.test(q)) return "admin";
  return "";
};

const buildConciseWorkflowLines = ({ question = "", hits = [], highlights = [], screens = [] }) => {
  const lines = [];
  const role = inferRoleHint(question);
  if (role) lines.push(`For ${role} role:`);

  const screenLabels = unique(screens.map(routeToLabel).filter(Boolean)).slice(0, 2);
  if (screenLabels.length) {
    lines.push(`Open ${screenLabels.join(" or ")}.`);
  }

  const steps = [];
  highlights.forEach((highlight) => {
    if (!shouldUseAsWorkflowStep(highlight)) return;
    const step = toSentence(highlight);
    if (step) steps.push(step);
  });

  if (!steps.length) {
    for (const hit of hits.slice(0, 6)) {
      const sourceLines = String(hit.content || "")
        .split("\n")
        .map(cleanCodeLine)
        .filter((line) => line && !shouldSkipLine(line));
      for (const line of sourceLines) {
        if (!shouldUseAsWorkflowStep(line)) continue;
        const step = toSentence(line);
        if (step) steps.push(step);
        if (steps.length >= 6) break;
      }
      if (steps.length >= 6) break;
    }
  }

  const uniqueSteps = unique(steps).slice(0, 4);
  if (uniqueSteps.length) {
    lines.push("Quick steps:");
    uniqueSteps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  } else {
    lines.push("Quick steps:");
    lines.push("1. Open the relevant Hawkeye workflow screen.");
    lines.push("2. Complete required fields and upload evidence where needed.");
    lines.push("3. Run the action button on the page (save/submit/run preview).");
  }
  return lines;
};

const normalizeCitation = (citation = "") =>
  String(citation || "")
    .replace(/\s+/g, " ")
    .trim();

export const isCitationWellFormed = (citation = "") => {
  const value = normalizeCitation(citation);
  if (!value) return false;
  if (/^doc:[a-z0-9_\-./]+#chunk-\d+$/i.test(value)) return true;
  if (/^(audit|capa|workflow|faq):[a-z0-9_\-./]+$/i.test(value)) return true;
  if (/^[a-z0-9_\-./]+#\d+$/i.test(value)) return true;
  if (/^(backend|frontend|tenant_kb)\/.+(:\d+)?$/i.test(value)) return true;
  return false;
};

export const validateAndNormalizeCitations = (citations = [], { limit = 8 } = {}) => {
  const valid = [];
  const invalid = [];
  normalizeArray(citations).forEach((citation) => {
    const normalized = normalizeCitation(citation);
    if (!normalized) return;
    if (isCitationWellFormed(normalized)) {
      if (!valid.includes(normalized) && valid.length < Math.max(1, Number(limit || 8))) {
        valid.push(normalized);
      }
      return;
    }
    if (!invalid.includes(normalized)) invalid.push(normalized);
  });
  return { valid, invalid };
};

const normalizeArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

export const rerankKnowledgeHits = async (question = "", hits = [], { limit = 8 } = {}) => {
  const candidates = Array.isArray(hits) ? hits.filter(Boolean) : [];
  if (!candidates.length) return [];

  const queryNorm = normalizeText(question || "");
  const queryLexical = AskHawkEmbeddingService.lexicalVector(question || "");
  const queryTokens = tokenize(question || "");
  const queryEmbedding = await AskHawkEmbeddingService.embedText(question || "");
  const hitEmbeddings = await Promise.all(
    candidates.map((hit) => AskHawkEmbeddingService.embedText(hit.content || ""))
  );

  const reranked = candidates.map((hit, idx) => {
    const candidateEmbedding = hitEmbeddings[idx] || { vector: [] };
    const semantic = AskHawkEmbeddingService.cosineSimilarity(
      queryEmbedding?.vector || [],
      candidateEmbedding.vector || []
    );
    const lexical = AskHawkEmbeddingService.lexicalCosine(
      queryLexical,
      AskHawkEmbeddingService.lexicalVector(hit.content || "")
    );
    const priorScore = Math.max(0, Math.min(1.2, Number(hit.score || 0)));
    const normalizedContent = normalizeText(hit.content || "");
    const termHits = queryTokens.filter((token) => normalizedContent.includes(token)).length;
    const phraseBoost = queryNorm && normalizedContent.includes(queryNorm) ? 0.08 : Math.min(0.06, termHits * 0.012);
    const citationBoost = isCitationWellFormed(hit.citation || "") ? 0.03 : -0.04;
    const sourceBoost = hit.source === "tenant_kb" ? 0.04 : 0.02;
    const rerankScore = priorScore * 0.35 + semantic * 0.42 + lexical * 0.18 + phraseBoost + citationBoost + sourceBoost;

    return {
      ...hit,
      rawScore: Number(priorScore.toFixed(6)),
      semanticScore: Number(semantic.toFixed(6)),
      lexicalScore: Number(lexical.toFixed(6)),
      score: Number(rerankScore.toFixed(6)),
    };
  });

  return reranked
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, Math.max(1, Number(limit || 8)));
};

export const calculateRetrievalConfidence = (hits = []) => {
  if (!Array.isArray(hits) || !hits.length) return 0;
  const top = Number(hits[0]?.score || 0);
  const second = Number(hits[1]?.score || 0);
  const spread = Math.max(0, top - second);
  const depth = Math.min(1, hits.length / 6);
  const confidence = Math.max(
    0,
    Math.min(0.99, top * 0.75 + spread * 0.45 + depth * 0.05)
  );
  return Number(confidence.toFixed(4));
};

export const composeKnowledgeAnswer = (question = "", hits = []) => {
  if (!hits.length) {
    return {
      answer:
        "I could not find a confident workflow match yet. Share your role, screen, and exact action for a precise answer.",
      citations: [],
      actions: [],
      followUps: [
        "Which role are you using?",
        "Which screen are you on?",
        "What exact action do you want to complete?",
      ],
      confidence: 0,
      grounded: false,
      unsupportedClaims: [],
    };
  }

  const highlights = extractHighlights(hits);
  const screens = unique(hits.map((hit) => hit?.meta?.screenRoute).filter(Boolean)).slice(0, 4);
  const citationResult = validateAndNormalizeCitations(
    unique(hits.map((hit) => hit.citation).filter(Boolean)),
    { limit: 8 }
  );
  const citations = citationResult.valid;
  const lines = buildConciseWorkflowLines({ question, hits, highlights, screens });

  const confidence = calculateRetrievalConfidence(hits);
  const grounded = citations.length > 0 && confidence >= 0.22;
  const unsupportedClaims = [];
  if (citationResult.invalid.length) {
    unsupportedClaims.push(`Filtered ${citationResult.invalid.length} invalid citation(s).`);
  }
  if (!grounded) {
    unsupportedClaims.push("Low-confidence retrieval; verify with exact screen/API context.");
  }
  return {
    answer: lines.join("\n"),
    citations,
    actions: inferActionHints(question),
    followUps: ["If needed, I can tailor this to buyer, supplier, or auditor steps."],
    confidence,
    grounded,
    unsupportedClaims,
  };
};

let cachedIndex = null;
let cachedAt = 0;
let buildInFlight = null;

const buildKnowledgeIndex = async () => {
  const candidates = await collectCandidateFiles();
  const backendRoot = process.cwd();
  const routeMounts = await routeMountMapFromApp(backendRoot);
  const docs = [];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate.absPath, "utf8");
      const mountPrefix =
        candidate.repo === "backend"
          ? routeMounts[toPosix(candidate.relPath)] || ""
          : "";
      const doc = buildDocEntry({
        repo: candidate.repo,
        relPath: candidate.relPath,
        raw,
        mountPrefix,
      });
      if (doc.chunks.length) docs.push(doc);
    } catch (_err) {
      continue;
    }
  }

  return buildKnowledgeIndexFromDocuments(docs);
};

export const getKnowledgeIndex = async ({ forceRebuild = false } = {}) => {
  if (!forceRebuild && cachedIndex && Date.now() - cachedAt <= INDEX_TTL_MS) {
    return cachedIndex;
  }
  if (!buildInFlight) {
    buildInFlight = buildKnowledgeIndex()
      .then((index) => {
        cachedIndex = index;
        cachedAt = Date.now();
        return cachedIndex;
      })
      .finally(() => {
        buildInFlight = null;
      });
  }
  return buildInFlight;
};

export const searchApplicationKnowledge = async ({
  query,
  productArea,
  limit = 8,
  minScore = 0.12,
} = {}) => {
  const index = await getKnowledgeIndex();
  return searchInKnowledgeIndex(index, { query, productArea, limit, minScore });
};

export const getKnowledgeStats = async () => {
  const index = await getKnowledgeIndex();
  const byRepo = (index.docs || []).reduce((acc, doc) => {
    const key = doc.repo || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    builtAt: index.builtAt,
    docs: index.stats?.docs || 0,
    chunks: index.stats?.chunks || 0,
    byRepo,
    source: LOCAL_KB_SOURCE,
  };
};

export const resetKnowledgeCache = () => {
  cachedIndex = null;
  cachedAt = 0;
  buildInFlight = null;
};

export const __testables = {
  normalizeText,
  tokenize,
  vectorize,
  cosine,
  isCitationWellFormed,
  validateAndNormalizeCitations,
  extractFrontendRoute,
  extractApiCalls,
  extractBackendEndpoints,
  scoreWindow,
};
