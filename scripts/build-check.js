import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";

const projectRoot = process.cwd();
const includeRoots = ["src", "scripts", "test"];
const ignoreDirNames = new Set([
  "node_modules",
  ".git",
  ".next",
  "uploads",
  "tmp",
  "out",
  "frontend",
  "python_services",
]);

const jsFiles = [];

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirNames.has(entry.name)) continue;
      await walk(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      jsFiles.push(fullPath);
    }
  }
};

const syntaxCheck = (filePath) => {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status === 0) return { ok: true };
  return {
    ok: false,
    stderr: result.stderr || result.stdout || "Unknown syntax error",
  };
};

const main = async () => {
  for (const root of includeRoots) {
    const fullRoot = path.join(projectRoot, root);
    try {
      const stat = await fs.stat(fullRoot);
      if (stat.isDirectory()) {
        await walk(fullRoot);
      }
    } catch {
      // optional root; ignore
    }
  }

  if (!jsFiles.length) {
    console.error("build-check: no JavaScript files found to validate");
    process.exit(1);
  }

  let failed = 0;
  for (const filePath of jsFiles.sort()) {
    const res = syntaxCheck(filePath);
    if (!res.ok) {
      failed += 1;
      const relative = path.relative(projectRoot, filePath);
      console.error(`\n[build-check] Syntax error in ${relative}\n${res.stderr}`);
    }
  }

  if (failed > 0) {
    console.error(`\nbuild-check: ${failed} file(s) failed syntax validation`);
    process.exit(1);
  }

  console.log(`build-check: syntax validated for ${jsFiles.length} file(s)`);
};

main().catch((error) => {
  console.error("build-check failed:", error?.message || error);
  process.exit(1);
});
