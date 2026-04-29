/**
 * Build a combined PDF test-results report covering BOTH the unit suite
 * and the end-to-end suite for the bug fixes shipped 2026-04-28 / 29.
 *
 * Reads:  test-results-bugfix/bugfix-unit-suite-latest.json
 *         test-results-bugfix/bugfix-e2e-suite-latest.json
 * Writes: test-results-bugfix/bugfix-combined-test-report-<stamp>.html + .pdf
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const dir = path.resolve(process.cwd(), "test-results-bugfix");
const unitJson = JSON.parse(fs.readFileSync(path.join(dir, "bugfix-unit-suite-latest.json"), "utf8"));
const e2eJson = JSON.parse(fs.readFileSync(path.join(dir, "bugfix-e2e-suite-latest.json"), "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const htmlPath = path.join(dir, `bugfix-combined-test-report-${stamp}.html`);
const pdfPath = path.join(dir, `bugfix-combined-test-report-${stamp}.pdf`);

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Hard-encoded section grouping (mirror of the suite output).
const unitSections = [
  { heading: "Bug #4 — applyPersonaScope auto-scopes by persona", match: /supplier sees only|supplierUser also|auditor uses auditorField|buyer is not scoped|tenant_admin is not scoped|PLATFORM admin scope|unknown persona is denied|missing supplierField/ },
  { heading: "Bug #2 — createTeamUser role inference", match: /invites →|unknown role falls back/ },
  { heading: "Bug #6 — auditor save preserves supplier responseDetails", match: /auditor edit|supplier edit/ },
  { heading: "Bug #7 — auditor finalize without follow-ups", match: /flagged questions|review_completed must NOT/ },
  { heading: "Bug #8/9 — buyer audit query construction", match: /buyer with tenant|buyer without tenant|buyer can NOT|superadmin sees/ },
  { heading: "Bug #9 — follow-up milestones filter", match: /hides follow-up|keeps follow-up/ },
  { heading: "Bug #10 — intimation letter token substitution", match: /substitutes \[|computes \[End Date\]|regression: no literal|falls back to today/ },
  { heading: "Bug #2 companion — isSupplierInitiationAcknowledged", match: /supplierIntimationAcceptedAt|Intimation acknowledged|Supplier accepted intimation|ACCEPTED decision|empty audit|generic 'accepted'/ },
  { heading: "dispatchNotification — severity inference", match: /DEVIATION_REPORTED → warning|PQ_REQUESTED → warning|CHANGE_CONTROL_OPENED → warning|AUDIT_REPORT_DRAFTED → info|PQ_DECISION → info|AUDIT_REPORT_REJECTED → critical/ },
  { heading: "notifySupplier — actionUrl propagation", match: /actionUrl is merged|payload is unchanged when actionUrl/ },
  { heading: "Bug #3/#5 — buyer-side menu inclusion", match: /SUPPLIER_MARKETPLACE includes|PRODUCT_CATALOG includes|REQUEST_AUDITS includes|AUDITOR_NETWORK includes|MY_WORKSPACE supplier menu/ },
  { heading: "Bug #7 — NotificationBell uses temporary Drawer", match: /NotificationBell no longer wraps|NotificationBell renders standard/ },
  { heading: "Earlier — supplier accept/reject row buttons", match: /audit table imports both|table renders showSupplierAcceptReject|buyer assign-auditor button/ },
];

const e2eSections = [
  { heading: "Bug #1 — signup surfaces verificationLink", match: /POST \/api\/auth\/register/ },
  { heading: "Bug #2 — team-user invitation flow", match: /can invite a teammate|inviting a teammate|non-tenant role/ },
  { heading: "Bug #4 — managed-organizations endpoint open to buyer", match: /managed-organizations|supplier also gets 200/ },
  { heading: "Bug #8/9 — buyer audit summary tenant-scoped", match: /buyer1 sees audits created by buyer2|buyer2 also sees audits|supplier sees audits where/ },
  { heading: "Bug #2 (earlier) — supplier-decision sets supplierDecision", match: /supplier-decision with ACCEPTED/ },
  { heading: "applyPersonaScope — supplier sees only own EQMS records", match: /only their own deviation|both deviations \(no persona/ },
  { heading: "PQ — supplierId required + acknowledge", match: /PQ create without|PQ create with supplierId|acknowledges PQ|sees only their own PQ/ },
  { heading: "Notification bridge — outbox + ModuleNotification", match: /both NotificationOutbox|carries actionUrl/ },
  { heading: "Deviation — supplier notification fires", match: /DEVIATION_REPORTED to supplier/ },
  { heading: "ChangeControl — SUPPLIER type requires supplierId", match: /changeType=SUPPLIER \+ no supplierId|with supplierId succeeds/ },
  { heading: "Bug #5 — express.json 25mb limit", match: /5mb JSON body without/ },
  { heading: "Bug #8 — CAPA mirrors into CapaV2", match: /CAPA generation writes to BOTH/ },
  { heading: "Bug #9 — follow-up milestones filtered out", match: /milestones excludes FOLLOWUP/ },
  { heading: "Bug #6 — auditor save preserves supplier answer", match: /empty responseDetails does NOT wipe/ },
];

const groupResults = (results, sections) => {
  const matched = new Set();
  const groups = sections.map((s) => {
    const tests = results.filter((r) => s.match.test(r.name));
    tests.forEach((t) => matched.add(t.name));
    return { heading: s.heading, tests };
  });
  const unmatched = results.filter((r) => !matched.has(r.name));
  if (unmatched.length) groups.push({ heading: "Other", tests: unmatched });
  return groups;
};

const unitGroups = groupResults(unitJson.results, unitSections);
const e2eGroups = groupResults(e2eJson.results, e2eSections);

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
    <h3>${escapeHtml(g.heading)}</h3>
    <div class="meta">${pass} passed · ${fail} failed · ${g.tests.length} total</div>
    <table>
      <thead><tr><th>Status</th><th>Test name</th><th>Duration</th><th>Error</th></tr></thead>
      <tbody>${g.tests.map(tableRow).join("")}</tbody>
    </table>
  `;
};

const stats = {
  unitPass: unitJson.results.filter((r) => r.status === "pass").length,
  unitFail: unitJson.results.filter((r) => r.status === "fail").length,
  unitTotal: unitJson.results.length,
  unitMs: unitJson.results.reduce((s, r) => s + (r.ms || 0), 0),
  e2ePass: e2eJson.results.filter((r) => r.status === "pass").length,
  e2eFail: e2eJson.results.filter((r) => r.status === "fail").length,
  e2eTotal: e2eJson.results.length,
  e2eMs: e2eJson.results.reduce((s, r) => s + (r.ms || 0), 0),
};
stats.totalPass = stats.unitPass + stats.e2ePass;
stats.totalFail = stats.unitFail + stats.e2eFail;
stats.total = stats.unitTotal + stats.e2eTotal;

// Bug coverage matrix — every bug from both batches mapped to whether it has
// unit and/or e2e coverage.
const coverage = [
  { id: "Earlier #1", title: "Supplier table missing accept/reject row buttons", unit: "✓", e2e: "—", note: "Source-shape unit assertion; UI-only" },
  { id: "Earlier #2", title: "Tracking conflated intimation accept with audit accept", unit: "✓", e2e: "✓", note: "isSupplierInitiationAcknowledged + supplier-decision route" },
  { id: "Earlier #3", title: 'Buyer "Assign auditor" not visible in row', unit: "✓", e2e: "—", note: "Source-shape (showBuyerAssign condition relaxed)" },
  { id: "Earlier #4", title: '"Phase closed" when re-assigning auditor', unit: "—", e2e: "—", note: "Verified by code-review; needs corrupted phaseState seed to repro" },
  { id: "Earlier #5", title: "SMF redaction save → Network Error", unit: "—", e2e: "✓", note: "5mb JSON body accepted" },
  { id: "Earlier #6", title: "Auditor checking criticality wipes supplier responses", unit: "✓", e2e: "✓", note: "responseDetails merge is role-aware" },
  { id: "Earlier #7", title: "Auditor can't finalize Execution Q without ≥1 follow-up", unit: "✓", e2e: "—", note: "Frontend logic; pure unit covers state-machine output" },
  { id: "Earlier #8", title: '"2 CAPAs generated" but list shows none', unit: "—", e2e: "✓", note: "CapaV2 mirror — found+fixed an enum mismatch during this run" },
  { id: "Earlier #9", title: "Tracking shows follow-up stages open with no follow-up", unit: "✓", e2e: "✓", note: "listInstances filter" },
  { id: "Earlier #10", title: "Intimation letter has hardcoded dates/duration/supplier", unit: "✓", e2e: "—", note: "Pure regex substitution covered by 9 unit tests" },
  { id: "Latest #1", title: "Signup verification email", unit: "—", e2e: "✓", note: "verificationLink + mailSent in response" },
  { id: "Latest #2", title: "Add Users tab missing in Buyer profile", unit: "✓", e2e: "✓", note: "team-user role inference + HTTP route" },
  { id: "Latest #3/#5", title: "Marketplace + Product Catalog missing for Buyer", unit: "✓", e2e: "—", note: "Menu-config role list assertions" },
  { id: "Latest #4", title: "Organization Context dropdowns empty", unit: "✓", e2e: "✓", note: "personaScope + managed-organizations route" },
  { id: "Latest #7", title: "Notification tray won't close", unit: "✓", e2e: "—", note: "Source-shape: Drawer not DetailsPanel" },
  { id: "Latest #8/9", title: "Buyer audit summary missing audits", unit: "✓", e2e: "✓", note: "Tenant-scoped OR personal query — verified end-to-end with 2 buyers" },
];

const coverageRow = (c) => `
  <tr>
    <td><strong>${escapeHtml(c.id)}</strong></td>
    <td>${escapeHtml(c.title)}</td>
    <td class="cov">${c.unit === "✓" ? '<span class="badge ok">UNIT</span>' : "—"}</td>
    <td class="cov">${c.e2e === "✓" ? '<span class="badge ok">E2E</span>' : "—"}</td>
    <td class="note">${escapeHtml(c.note)}</td>
  </tr>
`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Hawkeye Bug-Fix Test Report — Combined Unit + E2E</title>
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
  .summary { display: flex; gap: 8px; margin: 12px 0 16px; }
  .stat { flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; }
  .stat .n { font-size: 16pt; font-weight: 700; line-height: 1; color: #0f172a; }
  .stat .k { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .stat.ok .n { color: #047857; }
  .stat.ko .n { color: #b91c1c; }
  h2 { font-size: 14pt; font-weight: 700; margin: 22px 0 6px; color: #0f172a;
       border-bottom: 3px solid #0f766e; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 10.5pt; font-weight: 700; margin: 14px 0 4px; color: #0f172a;
       border-bottom: 1.5px solid #14b8a6; padding-bottom: 2px; page-break-after: avoid; }
  .meta { color: #64748b; font-size: 8.5pt; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 4px 0 12px; font-size: 8.8pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
  td.num { text-align: right; color: #64748b; white-space: nowrap; }
  td.err { color: #b91c1c; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8pt; }
  td.cov { text-align: center; }
  td.note { color: #475569; font-size: 8.4pt; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 7.5pt;
           font-weight: 700; letter-spacing: 0.04em; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.ko { background: #fee2e2; color: #b91c1c; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #cbd5e1;
            color: #94a3b8; font-size: 8pt; text-align: center; }
  .scope { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px;
           padding: 8px 12px; margin: 8px 0 16px; font-size: 9pt; color: #115e59; }
  .callout { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
             padding: 8px 12px; margin: 8px 0 16px; font-size: 9pt; color: #78350f; }
</style>
</head><body><div class="wrap">

<div class="cover">
  <h1>Hawkeye Bug-Fix Test Report</h1>
  <div class="sub">Combined unit + end-to-end suite · ${new Date().toLocaleString()}</div>
</div>

<div class="summary">
  <div class="stat ok"><div class="n">${stats.totalPass}</div><div class="k">Total Pass</div></div>
  <div class="stat ${stats.totalFail > 0 ? "ko" : "ok"}"><div class="n">${stats.totalFail}</div><div class="k">Total Fail</div></div>
  <div class="stat"><div class="n">${stats.total}</div><div class="k">Tests Run</div></div>
  <div class="stat"><div class="n">${(stats.unitMs + stats.e2eMs)}ms</div><div class="k">Total Duration</div></div>
</div>

<div class="callout">
  <strong>Defect found during E2E run.</strong> The Bug #8 fix
  (<code>generateCapasFromReport</code> mirroring CAPAs into the v2 collection)
  was silently failing in production: legacy <code>observationToCapaSeverity</code>
  returns lowercase values (<code>major</code>, <code>minor</code>) but the
  <code>CapaV2</code> schema enum requires uppercase (<code>HIGH</code>,
  <code>LOW</code>, etc). The mirror was caught by a try/catch that only
  logged a warning, so the legacy CAPA was created but never appeared in
  the workspace. Patched mid-run by adding an explicit severity map; the
  E2E test now passes and re-asserts that both collections receive the row.
</div>

<div class="scope">
  <strong>Test scope.</strong>
  <strong>Unit suite</strong> (${stats.unitTotal} tests) covers pure logic in
  isolation — role-filter construction, regex token substitution, query-builder
  branches, role-mapping tables, frontend config and source-shape assertions.
  No DB, no network.
  <strong>E2E suite</strong> (${stats.e2eTotal} tests) boots the full Express
  app against an in-memory MongoDB, seeds users + tenant + audits, signs
  real JWTs, and drives the app via real HTTP through middleware → router →
  controller → model → DB. Same code path as production traffic.
</div>

<h2>Bug coverage matrix</h2>
<table>
  <thead><tr><th>ID</th><th>Bug</th><th>Unit</th><th>E2E</th><th>Notes</th></tr></thead>
  <tbody>${coverage.map(coverageRow).join("")}</tbody>
</table>

<h2>Unit suite (${stats.unitPass}/${stats.unitTotal} passed · ${stats.unitMs}ms)</h2>
${unitGroups.map(sectionBlock).join("\n")}

<h2>End-to-end suite (${stats.e2ePass}/${stats.e2eTotal} passed · ${stats.e2eMs}ms)</h2>
${e2eGroups.map(sectionBlock).join("\n")}

<div class="footer">
  Hawkeye &middot; Bug-fix combined test report &middot; ${new Date().toISOString().slice(0, 10)}
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
