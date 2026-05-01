/**
 * rename-digilocker-to-hawkvault.mjs
 *
 * Display-only rebrand: replaces every USER-VISIBLE "DigiLocker" / "digilocker"
 * occurrence with "HawkVault" / "hawkvault" while leaving internal identifiers
 * (TypeScript types, variable names, function names, model class names,
 * MongoDB collection names, field names) intact.
 *
 * Strategy:
 *   1. Skip files where the only matches are import paths or type names
 *      (lib/digilockerApi.ts, model/service/controller/route filenames).
 *   2. Replace human-readable phrases with case-preserving substitutions:
 *        - "DigiLocker" surrounded by spaces / punctuation / quotes
 *        - JSX text content
 *        - String literals (when neighbour chars are quotes / >)
 *      Identifiers like `DigiLockerDocument`, `digilockerApi`, `digilockerId`
 *      are preserved because they're touching letters/underscores.
 *
 * Run from backend/: node scripts/rename-digilocker-to-hawkvault.mjs --apply
 * Without --apply, prints a dry-run report.
 */
import { readFileSync, writeFileSync, statSync } from "fs";
import { readdirSync } from "fs";
import { join, extname, relative } from "path";

const ROOT = join(process.cwd(), "..");
const FRONTEND = join(ROOT, "frontend");

const APPLY = process.argv.includes("--apply");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "_wt_frontend_dev_artifacts_20260223",
  "ci-repro-frontend", "_wt_backend_dev_artifacts_20260223",
  "test-results", "test-results-bugfix", "demo-artifacts", "playwright-report",
  "persona-walkthrough-report", "test-results-diag", "test-results-lifecycle",
  "test-results-persona-demo", "test-results-persona", "test-results-round1-no-ai",
  "test-results-round2-with-ai",
]);

// Files where ALL matches are pure identifiers — skip entirely.
const SKIP_FILES = new Set([
  // type-only library
  "lib/digilockerApi.ts",
  // route-folder pages — keep URL slug; only rename text inside.
]);

const isUserVisibleReplacement = (file) => {
  const rel = relative(FRONTEND, file).replace(/\\/g, "/");
  if (SKIP_FILES.has(rel)) return false;
  return /\.(tsx|ts|jsx|js|json|md)$/.test(rel);
};

const walk = (dir, files = []) => {
  const entries = readdirSync(dir);
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let stat;
    try { stat = statSync(p); } catch { continue; }
    if (stat.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
};

// Regex patterns for HUMAN-VISIBLE replacements only.
// They match `DigiLocker` / `digilocker` only when NOT preceded by an
// identifier character — i.e. when it's a standalone word (in a string
// literal, JSX text, comment, markdown).
const PATTERNS = [
  // CamelCase user-visible: "DigiLocker" with non-identifier neighbours.
  { re: /(^|[^A-Za-z0-9_])DigiLocker(?![A-Za-z0-9_])/g, repl: "$1HawkVault" },
  // lowercase "digilocker" — only when in a string literal context.
  // Match "digilocker" not part of an identifier (e.g. inside a string but
  // not as part of `digilockerApi`, `digilockerId`, `digilockerDocs`).
  // We require both sides to be non-identifier chars.
  { re: /(^|[^A-Za-z0-9_])digilocker(?![A-Za-z0-9_])/g, repl: "$1hawkvault" },
];

let totalFiles = 0;
let totalChanges = 0;
const changedFiles = [];

const files = walk(FRONTEND);
for (const file of files) {
  if (!isUserVisibleReplacement(file)) continue;
  let content;
  try { content = readFileSync(file, "utf-8"); } catch { continue; }
  if (!/(?:DigiLocker|digilocker)/.test(content)) continue;

  totalFiles++;
  let updated = content;
  let fileChanges = 0;
  for (const { re, repl } of PATTERNS) {
    const before = updated;
    updated = updated.replace(re, repl);
    if (before !== updated) {
      // count occurrences in the diff
      const diff = (before.match(re) || []).length;
      fileChanges += diff;
    }
  }
  if (fileChanges > 0 && updated !== content) {
    changedFiles.push({ file: relative(FRONTEND, file), changes: fileChanges });
    totalChanges += fileChanges;
    if (APPLY) writeFileSync(file, updated, "utf-8");
  }
}

console.log(APPLY ? "── APPLY ──" : "── DRY RUN (use --apply to write) ──");
console.log(`Files scanned with matches: ${totalFiles}`);
console.log(`Files that would change:    ${changedFiles.length}`);
console.log(`Total changes:              ${totalChanges}`);
console.log("");
for (const { file, changes } of changedFiles.sort((a, b) => b.changes - a.changes)) {
  console.log(`  ${changes.toString().padStart(3)}  ${file}`);
}
