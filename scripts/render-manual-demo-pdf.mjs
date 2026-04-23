/**
 * Render docs/03-user-guides/manual-demo-script.html → manual-demo-script.pdf.
 * Standalone helper because the demo script gets edited often.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const htmlPath = path.join(repoRoot, "docs/03-user-guides/manual-demo-script.html");
const pdfPath  = path.join(repoRoot, "docs/03-user-guides/manual-demo-script.pdf");

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: pdfPath,
  format: "Letter",
  margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
  printBackground: true,
});
await browser.close();
console.log("wrote", pdfPath, fs.statSync(pdfPath).size, "bytes");
