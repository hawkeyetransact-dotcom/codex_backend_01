import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "..", "docs/09-test-reports/executed-demo-script.html");
const outPath  = path.resolve(__dirname, "..", "docs/09-test-reports/preview.png");
const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 980, height: 1500 }, deviceScaleFactor: 1 }).then((c) => c.newPage());
await p.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
// Scroll to Scene 2 (most important)
await p.evaluate(() => document.querySelectorAll("h2")[2]?.scrollIntoView());
await p.waitForTimeout(800);
await p.screenshot({ path: outPath, fullPage: false });
await b.close();
console.log("preview:", outPath);
