/**
 * Build a PDF test-results report from the latest bugfix-unit-suite JSON.
 *
 * Run:
 *   node scripts/build-bugfix-test-report.mjs
 *
 * Reads:  test-results-bugfix/bugfix-unit-suite-latest.json
 * Writes: test-results-bugfix/bugfix-unit-test-report-<stamp>.html + .pdf
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const dir = path.resolve(process.cwd(), "test-results-bugfix");
const jsonPath = path.join(dir, "bugfix-unit-suite-latest.json");
if (!fs.existsSync(jsonPath)) {
  console.error("Missing bugfix-unit-suite-latest.json — run the test suite first.");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const stamp = new Date(report.runAt).toISOString().replace(/[:.]/g, "-");
const htmlPath = path.join(dir, `bugfix-unit-test-report-${stamp}.html`);
const pdfPath = path.join(dir, `bugfix-unit-test-report-${stamp}.pdf`);

// ── group results by section heading (the test runner used "── X ──" lines).
// Since the JSON only has flat results, re-derive sections from the suite's
// human-readable section names recorded in the test names is not possible —
// instead we hard-encode the section ordering from the suite file.
const sections = [
  { heading: "Bug #4 — applyPersonaScope auto-scopes by persona", match: /supplier sees only|supplierUser also|auditor uses auditorField|buyer is not scoped|tenant_admin is not scoped|PLATFORM admin scope|unknown persona is denied|missing supplierField/ },
  { heading: "Bug #2 — createTeamUser role inference", match: /invites →|unknown role falls back/ },
  { heading: "Bug #6 — auditor save preserves supplier responseDetails", match: /auditor edit|supplier edit/ },
  { heading: "Bug #7 — auditor finalize without follow-ups", match: /flagged questions|review_completed must NOT/ },
  { heading: "Bug #8/9 — buyer audit query construction", match: /buyer with tenant|buyer without tenant|buyer can NOT|superadmin sees/ },
  { heading: "Bug #9 — follow-up milestones hidden when no follow-up active", match: /hides follow-up|keeps follow-up/ },
  { heading: "Bug #10 — intimation letter token substitution", match: /substitutes \[|computes \[End Date\]|regression: no literal|falls back to today/ },
  { heading: "Bug #2 companion — isSupplierInitiationAcknowledged accepts new field", match: /supplierIntimationAcceptedAt|Intimation acknowledged|Supplier accepted intimation|ACCEPTED decision|empty audit|generic 'accepted'/ },
  { heading: "dispatchNotification — severity inference for new event keys", match: /DEVIATION_REPORTED → warning|PQ_REQUESTED → warning|CHANGE_CONTROL_OPENED → warning|AUDIT_REPORT_DRAFTED → info|PQ_DECISION → info|AUDIT_REPORT_REJECTED → critical/ },
  { heading: "notifySupplier — actionUrl propagated into payload", match: /actionUrl is merged|payload is unchanged when actionUrl/ },
  { heading: "Bug #3/#5 — buyer-side menu items include both BUYER and TENANT_ADMIN", match: /SUPPLIER_MARKETPLACE includes|PRODUCT_CATALOG includes|REQUEST_AUDITS includes|AUDITOR_NETWORK includes|MY_WORKSPACE supplier menu/ },
  { heading: "Bug #7 — NotificationBell uses temporary Drawer for backdrop dismissal", match: /NotificationBell no longer wraps|NotificationBell renders standard/ },
  { heading: "Bug #1/Bug #5 (earlier batch) — supplier accept/reject row buttons", match: /audit table imports both|table renders showSupplierAcceptReject|buyer assign-auditor button/ },
];

const grouped = sections.map((s) => ({
  heading: s.heading,
  tests: report.results.filter((r) => s.match.test(r.name)),
}));

// Find any tests that didn't match a section (defensive).
const matched = new Set(grouped.flatMap((g) => g.tests.map((t) => t.name)));
const unmatched = report.results.filter((r) => !matched.has(r.name));
if (unmatched.length) {
  grouped.push({ heading: "Other", tests: unmatched });
}

const totalPass = report.results.filter((r) => r.status === "pass").length;
const totalFail = report.results.filter((r) => r.status === "fail").length;
const totalMs = report.results.reduce((sum, r) => sum + (r.ms || 0), 0);

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const tableRow = (r) => `
  <tr>
    <td><span class="badge ${r.status === "pass" ? "ok" : "ko"}">${r.status === "pass" ? "PASS" : "FAIL"}</span></td>
    <td>${escapeHtml(r.name)}</td>
    <td class="num">${r.ms}ms</td>
    ${r.error ? `<td class="err">${escapeHtml(r.error)}</td>` : "<td>—</td>"}
  </tr>
`;

const sectionBlock = (g) => {
  const pass = g.tests.filter((r) => r.status === "pass").length;
  const fail = g.tests.filter((r) => r.status === "fail").length;
  return `
    <h2>${escapeHtml(g.heading)}</h2>
    <div class="meta">${pass} passed · ${fail} failed · ${g.tests.length} total</div>
    <table>
      <thead><tr><th>Status</th><th>Test name</th><th>Duration</th><th>Error</th></tr></thead>
      <tbody>${g.tests.map(tableRow).join("")}</tbody>
    </table>
  `;
};

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Hawkeye Bug-Fix Unit Test Report</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
         font-size: 9.5pt; line-height: 1.4; color: #1a1d23;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 6px 0; }
  .cover { padding: 14px 0 8px; border-bottom: 3px solid #0f766e; margin-bottom: 16px; }
  .cover h1 { margin: 0; font-size: 20pt; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
  .cover .sub { color: #64748b; font-size: 9pt; margin-top: 2px; }
  .summary { display: flex; gap: 12px; margin: 12px 0 16px; }
  .stat { flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; }
  .stat .n { font-size: 18pt; font-weight: 700; line-height: 1; color: #0f172a; }
  .stat .k { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .stat.ok .n { color: #047857; }
  .stat.ko .n { color: #b91c1c; }
  h2 { font-size: 11pt; font-weight: 700; margin: 18px 0 4px; color: #0f172a;
       border-bottom: 2px solid #0f766e; padding-bottom: 3px; page-break-after: avoid; }
  .meta { color: #64748b; font-size: 8.5pt; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 4px 0 12px; font-size: 8.8pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
  td.num { text-align: right; color: #64748b; white-space: nowrap; }
  td.err { color: #b91c1c; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8pt; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 7.5pt;
           font-weight: 700; letter-spacing: 0.04em; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.ko { background: #fee2e2; color: #b91c1c; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #cbd5e1;
            color: #94a3b8; font-size: 8pt; text-align: center; }
  .scope { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px;
           padding: 8px 12px; margin: 8px 0 16px; font-size: 9pt; color: #115e59; }
</style>
</head><body><div class="wrap">

<div class="cover">
  <h1>Hawkeye Bug-Fix Unit Test Report</h1>
  <div class="sub">Run at ${new Date(report.runAt).toLocaleString()} · Pure unit tests, no DB / no network</div>
</div>

<div class="summary">
  <div class="stat ok"><div class="n">${totalPass}</div><div class="k">Passed</div></div>
  <div class="stat ${totalFail > 0 ? "ko" : "ok"}"><div class="n">${totalFail}</div><div class="k">Failed</div></div>
  <div class="stat"><div class="n">${report.total}</div><div class="k">Total</div></div>
  <div class="stat"><div class="n">${totalMs}ms</div><div class="k">Duration</div></div>
</div>

<div class="scope">
  <strong>Scope.</strong> Pure unit tests covering every bug fix shipped between
  2026-04-28 and 2026-04-29. Each test exercises the deterministic logic that
  ships in production (role-based filter construction, regex token
  substitution, query-builder branches, role-mapping tables, and frontend
  config entries). DB-bound integration paths (notification persistence,
  Mongoose model writes, route handlers) are out of scope here — those are
  covered by separate integration suites and live verification scripts.
</div>

${grouped.map(sectionBlock).join("\n")}

<div class="footer">
  Hawkeye &middot; Bug-fix unit-test report &middot; ${new Date().toISOString().slice(0, 10)}
</div>

</div></body></html>`;

fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();

const sz = fs.statSync(pdfPath).size;
console.log(`Wrote ${path.basename(htmlPath)} + ${path.basename(pdfPath)} (${sz} bytes)`);
console.log(`Path: ${pdfPath}`);
