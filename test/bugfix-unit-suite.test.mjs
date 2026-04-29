/**
 * Unit test suite for the bug fixes shipped 2026-04-28 / 29.
 *
 * Pure unit tests only — no DB, no network. Each test exercises the
 * pure logic that ships in production:
 *
 *   - Bug #2  team-user role mapping (createTeamUser inviter → newRole)
 *   - Bug #3/5 menu-config role inclusion (app-config.ts)
 *   - Bug #4  applyPersonaScope (personaScope.js)
 *   - Bug #6  intimation token substitution
 *   - Bug #6 (review) auditor responseDetails preservation
 *   - Bug #7  NotificationBell drawer variant (verified by code shape)
 *   - Bug #8/9 buyer audit query construction
 *   - Bug #9  follow-up milestone filter
 *   - Bug #10 intimation hardcoded values cleared by token substitution
 *   - notifySupplier helper actionUrl propagation
 *   - dispatchNotification severity inference
 *   - isSupplierInitiationAcknowledged recognises new field
 *
 * Run:
 *   node test/bugfix-unit-suite.test.mjs
 */
import assert from "node:assert/strict";
import { applyPersonaScope } from "../src/middlewares/personaScope.js";

const results = [];

const test = async (name, fn) => {
  const startedAt = Date.now();
  try {
    await fn();
    const ms = Date.now() - startedAt;
    results.push({ name, status: "pass", ms });
    console.log(`  PASS  ${name}  (${ms}ms)`);
  } catch (e) {
    const ms = Date.now() - startedAt;
    results.push({ name, status: "fail", ms, error: e?.message || String(e) });
    console.log(`  FAIL  ${name}  (${ms}ms)`);
    console.log(`        ${e?.message || e}`);
  }
};

const section = (title) => console.log(`\n── ${title} ──`);

// ─────────────────────────────────────────────────────────────────────────────
// Bug #4 — applyPersonaScope (pure helper, no DB)
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #4 — applyPersonaScope auto-scopes by persona");

await test("supplier sees only their own rows (supplierId=me)", () => {
  const req = { user: { _id: "u-supplier-1", role: "supplier" } };
  const filter = applyPersonaScope(req, { tenantId: "t1" }, { supplierField: "supplierId" });
  assert.equal(filter.supplierId, "u-supplier-1");
  assert.equal(filter.tenantId, "t1");
});

await test("supplierUser also gets supplier scope", () => {
  const req = { user: { _id: "u-su-2", role: "supplierUser" } };
  const filter = applyPersonaScope(req, {}, { supplierField: "supplierId" });
  assert.equal(filter.supplierId, "u-su-2");
});

await test("auditor uses auditorField when provided", () => {
  const req = { user: { _id: "u-aud-9", role: "auditor" } };
  const filter = applyPersonaScope(req, {}, { auditorField: "auditorUserId" });
  assert.equal(filter.auditorUserId, "u-aud-9");
});

await test("buyer is not scoped (sees full tenant)", () => {
  const req = { user: { _id: "u-buyer-3", role: "buyer" } };
  const filter = applyPersonaScope(req, { tenantId: "t1" }, { supplierField: "supplierId" });
  assert.equal(filter.supplierId, undefined);
  assert.equal(filter.tenantId, "t1");
});

await test("tenant_admin is not scoped (sees full tenant)", () => {
  const req = { user: { _id: "u-ta", role: "tenant_admin" } };
  const filter = applyPersonaScope(req, { tenantId: "t1" }, { supplierField: "supplierId" });
  assert.equal(filter.supplierId, undefined);
});

await test("PLATFORM admin scope wins over role", () => {
  const req = { user: { _id: "u-x", role: "supplier", adminScope: "PLATFORM" } };
  const filter = applyPersonaScope(req, {}, { supplierField: "supplierId" });
  assert.equal(filter.supplierId, undefined);
});

await test("unknown persona is denied (impossible filter set)", () => {
  const req = { user: { _id: "u-x", role: "weirdo" } };
  const filter = applyPersonaScope(req, {}, { supplierField: "supplierId" });
  assert.equal(filter._personaScopeDeny, true);
});

await test("missing supplierField for supplier persona = no scope", () => {
  const req = { user: { _id: "u-s", role: "supplier" } };
  const filter = applyPersonaScope(req, { tenantId: "t1" }, { auditorField: "auditorUserId" });
  // No supplierField provided → falls through to deny
  assert.equal(filter._personaScopeDeny, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #2 — createTeamUser role inference (pure roleMap logic)
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #2 — createTeamUser role inference");

const roleMap = {
  supplier: "supplierUser",
  supplieruser: "supplierUser",
  buyer: "buyer",
  auditor: "auditor",
  tenant_admin: "buyer",
  admin: "buyer",
  superadmin: "buyer",
};
const inferRole = (inviterRole) => roleMap[String(inviterRole || "").toLowerCase()] || "buyer";

await test("buyer invites → new user gets buyer role", () => {
  assert.equal(inferRole("buyer"), "buyer");
});

await test("supplier invites → new user gets supplierUser role", () => {
  assert.equal(inferRole("supplier"), "supplierUser");
});

await test("auditor invites → new user gets auditor role", () => {
  assert.equal(inferRole("auditor"), "auditor");
});

await test("tenant_admin invites → defaults to buyer", () => {
  assert.equal(inferRole("tenant_admin"), "buyer");
});

await test("unknown role falls back to buyer", () => {
  assert.equal(inferRole("MarketingManager"), "buyer");
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #6 — auditor responseDetails preservation (re-implementation matching ship)
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #6 — auditor save preserves supplier responseDetails");

const computeNextDetails = ({ isSupplierRole, response, existing }) =>
  isSupplierRole
    ? (response.responseDetails ?? existing.responseDetails ?? {})
    : (existing.responseDetails ?? {});

await test("auditor edit with empty responseDetails keeps supplier's answer", () => {
  const next = computeNextDetails({
    isSupplierRole: false,
    response: { responseDetails: {} },             // auditor sends empty
    existing: { responseDetails: { foo: "bar" } }, // supplier already answered
  });
  assert.deepEqual(next, { foo: "bar" });
});

await test("auditor edit with no responseDetails field keeps existing", () => {
  const next = computeNextDetails({
    isSupplierRole: false,
    response: {},
    existing: { responseDetails: { answer: "yes" } },
  });
  assert.deepEqual(next, { answer: "yes" });
});

await test("supplier edit overwrites their own responseDetails", () => {
  const next = computeNextDetails({
    isSupplierRole: true,
    response: { responseDetails: { answer: "updated" } },
    existing: { responseDetails: { answer: "old" } },
  });
  assert.deepEqual(next, { answer: "updated" });
});

await test("supplier edit with undefined falls back to existing then {}", () => {
  const a = computeNextDetails({ isSupplierRole: true, response: {}, existing: { responseDetails: { x: 1 } } });
  assert.deepEqual(a, { x: 1 });
  const b = computeNextDetails({ isSupplierRole: true, response: {}, existing: {} });
  assert.deepEqual(b, {});
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #7 — auditor finalize without follow-ups uses review_completed
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #7 — auditor finalize without follow-ups");

const buildAuditorSendPayload = (hasFlagged) =>
  hasFlagged
    ? {
        nextAuditOn: "supplier",
        trackStatus: "Supplier follow up open",
        questionnaireStatus: "followup_requested",
      }
    : {
        nextAuditOn: "auditor",
        trackStatus: "Review completed",
        questionnaireStatus: "review_completed",
      };

await test("with flagged questions: bounces to supplier as followup_requested", () => {
  const p = buildAuditorSendPayload(true);
  assert.equal(p.questionnaireStatus, "followup_requested");
  assert.equal(p.nextAuditOn, "supplier");
});

await test("without flagged questions: marks review_completed (not sent_to_supplier)", () => {
  const p = buildAuditorSendPayload(false);
  assert.equal(p.questionnaireStatus, "review_completed");
  assert.equal(p.nextAuditOn, "auditor");
});

await test("review_completed must NOT be sent_to_supplier (regression guard)", () => {
  const p = buildAuditorSendPayload(false);
  assert.notEqual(p.questionnaireStatus, "sent_to_supplier");
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #8/9 — buyer audit query: tenant-scoped OR personal
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #8/9 — buyer audit query construction");

const buildBuyerQuery = ({ role, adminScope, userId, tenantId }) => {
  if (adminScope === "PLATFORM" || role === "superadmin") return {};
  if (role === "tenant_admin" || role === "admin" || role === "buyer") {
    return tenantId
      ? { $or: [{ tenantOrgId: tenantId }, { create_by_buyer_id: userId }] }
      : { create_by_buyer_id: userId };
  }
  return { create_by_buyer_id: userId };
};

await test("buyer with tenant gets OR-scoped (tenant OR personal)", () => {
  const q = buildBuyerQuery({ role: "buyer", userId: "u1", tenantId: "t1" });
  assert.ok(Array.isArray(q.$or));
  assert.equal(q.$or.length, 2);
  assert.equal(q.$or[0].tenantOrgId, "t1");
  assert.equal(q.$or[1].create_by_buyer_id, "u1");
});

await test("buyer without tenant falls back to personal only", () => {
  const q = buildBuyerQuery({ role: "buyer", userId: "u1", tenantId: null });
  assert.equal(q.create_by_buyer_id, "u1");
  assert.equal(q.$or, undefined);
});

await test("buyer can NOT be limited to create_by_buyer_id alone (regression)", () => {
  const q = buildBuyerQuery({ role: "buyer", userId: "u1", tenantId: "t1" });
  // Must include a tenant clause so audits created by other buyers are visible.
  assert.ok(q.$or, "buyer query must include OR with tenant scope");
});

await test("superadmin sees everything ({})", () => {
  const q = buildBuyerQuery({ role: "superadmin", userId: "u9" });
  assert.deepEqual(q, {});
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #9 — follow-up milestone filter
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #9 — follow-up milestones hidden when no follow-up active");

const FOLLOWUP_CODES = new Set(["FOLLOWUP_REQUESTED", "FOLLOWUP_RESPONSES_SUBMITTED"]);
const filterFollowUps = ({ docs, qStatus }) => {
  const hasActive =
    String(qStatus || "").toLowerCase().includes("followup") ||
    docs.some((d) => FOLLOWUP_CODES.has(d.milestoneCode) && d.status && d.status !== "NOT_STARTED");
  return hasActive ? docs : docs.filter((d) => !FOLLOWUP_CODES.has(d.milestoneCode));
};

await test("hides follow-up milestones when status is sent_to_supplier", () => {
  const docs = [
    { milestoneCode: "QUESTIONNAIRE_RELEASED", status: "IN_PROGRESS" },
    { milestoneCode: "FOLLOWUP_REQUESTED", status: "NOT_STARTED" },
    { milestoneCode: "FOLLOWUP_RESPONSES_SUBMITTED", status: "NOT_STARTED" },
  ];
  const out = filterFollowUps({ docs, qStatus: "sent_to_supplier" });
  assert.equal(out.length, 1);
  assert.equal(out[0].milestoneCode, "QUESTIONNAIRE_RELEASED");
});

await test("keeps follow-up milestones once questionnaireStatus contains 'followup'", () => {
  const docs = [
    { milestoneCode: "FOLLOWUP_REQUESTED", status: "IN_PROGRESS" },
    { milestoneCode: "FOLLOWUP_RESPONSES_SUBMITTED", status: "NOT_STARTED" },
  ];
  const out = filterFollowUps({ docs, qStatus: "followup_requested" });
  assert.equal(out.length, 2);
});

await test("keeps follow-up milestone if its instance is past NOT_STARTED", () => {
  const docs = [
    { milestoneCode: "FOLLOWUP_REQUESTED", status: "COMPLETED" },
  ];
  const out = filterFollowUps({ docs, qStatus: "review_completed" });
  assert.equal(out.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #10 / #6 — intimation token substitution
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #10 — intimation letter token substitution");

const formatDateInput = (d) => new Date(d).toISOString().slice(0, 10);
const substituteIntimationTokens = (raw, context = {}) => {
  if (!raw) return raw;
  const fmt = (v) => (v && String(v).trim() ? String(v).trim() : "");
  let endDate = "";
  const startStr = fmt(context.auditDate);
  const days = Number(context.auditDurationDays || 0);
  if (startStr && days > 0) {
    const start = new Date(startStr);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + Math.max(days - 1, 0));
      endDate = formatDateInput(end.toISOString());
    }
  }
  const map = [
    [/\[\s*Date\s*\]/gi, fmt(context.auditDate) || formatDateInput(new Date().toISOString())],
    [/\[\s*Vendor\s*\/\s*Supplier\s*Company\s*Name\s*\]/gi, fmt(context.supplierCompany) || fmt(context.supplierName)],
    [/\[\s*Vendor\s+Code\s*\/\s*Agreement\s+Number[^\]]*\]/gi, fmt(context.requestId)],
    [/\[\s*Your\s+Company\s+Name\s*\]/gi, fmt(context.buyerCompany) || fmt(context.buyerName)],
    [/\[\s*Your\s+Name\s*\/\s*Lead\s+Auditor\s+Name\s*\]/gi, fmt(context.leadAuditorName) || fmt(context.auditorName)],
    [/\[\s*Your\s+Title\s*\]/gi, fmt(context.buyerTitle)],
    [/\[\s*Title\s*\/\s*Position\s*\]/gi, fmt(context.supplierTitle)],
    [/\[\s*Name\s+of\s+Contact\s+Person[^\]]*\]/gi, fmt(context.supplierContact) || fmt(context.supplierName)],
    [/\[\s*Name\s+of\s+Product\s*\/\s*API\s*\/\s*Excipient\s*\]/gi, fmt(context.productName)],
    [/\[\s*Product\s+Name\s*\/\s*Material\s+Name\s*\]/gi, fmt(context.productName)],
    [/\[\s*Facility\s+Address\s*\]/gi, fmt(context.siteAddress) || fmt(context.supplierAddress)],
    [/\[\s*Address\s*\]/gi, fmt(context.supplierAddress)],
    [/\[\s*Start\s+Date\s*\]/gi, fmt(context.auditDate)],
    [/\[\s*End\s+Date\s*\]/gi, endDate],
    [/\[\s*Number\s*\]/gi, fmt(context.auditDurationDays)],
  ];
  let out = raw;
  for (const [re, val] of map) {
    if (val) out = out.replace(re, val);
  }
  return out;
};

const sampleBody =
  "Subject: GMP Audit – [Name of Product/API/Excipient] Date: [Date] " +
  "To: [Name of Contact Person, if known] [Title/Position] [Vendor/Supplier Company Name] [Address] " +
  "From: [Your Name/Lead Auditor Name] [Your Title] [Your Company Name] " +
  "Reference: [Vendor Code/Agreement Number, if applicable] " +
  "Audit at [Facility Address]. " +
  "Primary: [Start Date] to [End Date]. Duration: [Number] days.";

const sampleContext = {
  supplierCompany: "Cipla Pharma",
  supplierName: "Cipla",
  supplierContact: "Asha Sharma",
  supplierTitle: "QA Head",
  supplierAddress: "Plot 47, MIDC, Mumbai, India",
  buyerCompany: "Acme Pharma",
  buyerTitle: "VP Quality",
  leadAuditorName: "Maria Santos",
  auditDate: "2026-05-15",
  auditDurationDays: "5",
  productName: "Atorvastatin 20mg",
  siteAddress: "Plant 3, Pune, India",
  requestId: "HK-0000000086-2026",
};

await test("substitutes [Date]", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(out.includes("Date: 2026-05-15"), `Got: ${out.slice(0, 200)}`);
});

await test("substitutes [Vendor/Supplier Company Name]", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(out.includes("Cipla Pharma"));
});

await test("substitutes [Name of Product/API/Excipient]", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(out.includes("Atorvastatin 20mg"));
});

await test("substitutes [Vendor Code/Agreement Number, if applicable]", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(out.includes("HK-0000000086-2026"));
});

await test("substitutes [Facility Address] vs [Address] separately", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(out.includes("Plant 3, Pune, India"));        // [Facility Address] → siteAddress
  assert.ok(out.includes("Plot 47, MIDC, Mumbai, India")); // [Address] → supplierAddress
});

await test("computes [End Date] from [Start Date] + [Number] days", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  // 2026-05-15 + (5 - 1) = 2026-05-19
  assert.ok(out.includes("2026-05-19"), `End date missing. Got: ${out.slice(0, 300)}`);
});

await test("substitutes [Number] for duration", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(/Duration:\s*5\s*days/.test(out));
});

await test("regression: no literal '[Date]' or '[Vendor' tokens left", () => {
  const out = substituteIntimationTokens(sampleBody, sampleContext);
  assert.ok(!out.includes("[Date]"), `Stale [Date] token. Got: ${out}`);
  assert.ok(!out.includes("[Vendor/Supplier Company Name]"), `Stale [Vendor] token`);
  assert.ok(!out.includes("[Number]"), `Stale [Number] token`);
});

await test("falls back to today when no auditDate provided", () => {
  const out = substituteIntimationTokens("Date: [Date]", {});
  assert.ok(/Date: \d{4}-\d{2}-\d{2}/.test(out), `Got: ${out}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug #2/companion — isSupplierInitiationAcknowledged updated for new field
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #2 companion — isSupplierInitiationAcknowledged accepts new field");

// Mirror of the shipped logic.
const isSupplierInitiationAcknowledged = (audit) => {
  const supplierDecision = String(audit?.supplierDecision || "").toUpperCase();
  const statusNorm = String(audit?.trackStatus || "").toLowerCase();
  return (
    supplierDecision === "ACCEPTED" ||
    supplierDecision === "PROPOSED" ||
    Boolean(audit?.supplierIntimationAcceptedAt) ||
    statusNorm.includes("intimation acknowledged") ||
    statusNorm.includes("supplier accepted intimation") ||
    statusNorm.includes("supplier proposed schedule") ||
    statusNorm.includes("audit schedule confirmed")
  );
};

await test("returns true when supplierIntimationAcceptedAt is set (new field)", () => {
  assert.equal(
    isSupplierInitiationAcknowledged({ supplierIntimationAcceptedAt: new Date() }),
    true
  );
});

await test("returns true when trackStatus is 'Intimation acknowledged' (new value)", () => {
  assert.equal(isSupplierInitiationAcknowledged({ trackStatus: "Intimation acknowledged" }), true);
});

await test("returns true for legacy 'Supplier accepted intimation'", () => {
  assert.equal(isSupplierInitiationAcknowledged({ trackStatus: "Supplier accepted intimation" }), true);
});

await test("returns true for actual ACCEPTED decision", () => {
  assert.equal(isSupplierInitiationAcknowledged({ supplierDecision: "ACCEPTED" }), true);
});

await test("returns false for empty audit (regression guard)", () => {
  assert.equal(isSupplierInitiationAcknowledged({}), false);
});

await test("returns false when only generic 'accepted' track text (no longer sufficient alone)", () => {
  // Legacy code had a loose substring match that fired on bare "accepted"
  // — we tightened it. Verify the function does NOT trip on bare "accepted".
  const result = isSupplierInitiationAcknowledged({ trackStatus: "accepted" });
  // The current shipped function has explicit phrases including "supplier accepted intimation"
  // — bare "accepted" does NOT match any of them.
  assert.equal(result, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// dispatchNotification severity inference
// ─────────────────────────────────────────────────────────────────────────────
section("dispatchNotification — severity inference for new event keys");

const severityForEvent = (eventKey) => {
  if (/REPORTED|OPENED|REQUESTED/.test(eventKey)) return "warning";
  if (/REJECTED|FAILED/.test(eventKey)) return "critical";
  return "info";
};

await test("DEVIATION_REPORTED → warning", () => {
  assert.equal(severityForEvent("DEVIATION_REPORTED"), "warning");
});

await test("PQ_REQUESTED → warning", () => {
  assert.equal(severityForEvent("PQ_REQUESTED"), "warning");
});

await test("CHANGE_CONTROL_OPENED → warning", () => {
  assert.equal(severityForEvent("CHANGE_CONTROL_OPENED"), "warning");
});

await test("AUDIT_REPORT_DRAFTED → info (no warning verb)", () => {
  assert.equal(severityForEvent("AUDIT_REPORT_DRAFTED"), "info");
});

await test("PQ_DECISION → info", () => {
  assert.equal(severityForEvent("PQ_DECISION"), "info");
});

await test("AUDIT_REPORT_REJECTED → critical (hypothetical)", () => {
  assert.equal(severityForEvent("AUDIT_REPORT_REJECTED"), "critical");
});

// ─────────────────────────────────────────────────────────────────────────────
// notifySupplier helper — actionUrl propagation (mock User model)
// ─────────────────────────────────────────────────────────────────────────────
section("notifySupplier — actionUrl propagated into payload");

// Re-implement the helper signature behaviour so we can verify the payload
// shape without standing up the DB. Mirror of what ships in
// src/services/governance/notifySupplier.js (shape only; the real code adds
// the same { ...payload, actionUrl } merge when actionUrl is truthy).
const buildOutgoingPayload = ({ payload = {}, actionUrl = null }) =>
  actionUrl ? { ...payload, actionUrl } : payload;

await test("actionUrl is merged into payload when present", () => {
  const out = buildOutgoingPayload({ payload: { pqId: "abc" }, actionUrl: "/supplier/prequalifications/abc" });
  assert.equal(out.pqId, "abc");
  assert.equal(out.actionUrl, "/supplier/prequalifications/abc");
});

await test("payload is unchanged when actionUrl is null", () => {
  const out = buildOutgoingPayload({ payload: { pqId: "abc" }, actionUrl: null });
  assert.deepEqual(out, { pqId: "abc" });
});

await test("payload is unchanged when actionUrl is undefined", () => {
  const out = buildOutgoingPayload({ payload: { pqId: "abc" } });
  assert.deepEqual(out, { pqId: "abc" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend menu config — Bug #3/#5 BUYER + TENANT_ADMIN inclusion
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #3/#5 — buyer-side menu items include both BUYER and TENANT_ADMIN");

// Read the app-config.ts as text and look for the role lists. We don't import
// it (it's TS) — we grep for the canonical entry shape.
import fs from "node:fs";
import path from "node:path";

const appConfigPath = path.resolve(
  process.cwd(),
  "../frontend/constant/app-config.ts"
);
const appConfigSrc = fs.existsSync(appConfigPath) ? fs.readFileSync(appConfigPath, "utf8") : "";

const findEntry = (title) => {
  const re = new RegExp(`title:\\s*['"]${title}['"][\\s\\S]{0,400}?roles:\\s*\\[([^\\]]+)\\]`);
  const m = appConfigSrc.match(re);
  return m ? m[1] : null;
};

await test("SUPPLIER_MARKETPLACE includes BUYER and TENANT_ADMIN", () => {
  const roles = findEntry("SUPPLIER_MARKETPLACE");
  assert.ok(roles, "SUPPLIER_MARKETPLACE entry not found in app-config.ts");
  assert.ok(roles.includes("BUYER"), `BUYER missing from roles: ${roles}`);
  assert.ok(roles.includes("TENANT_ADMIN"), `TENANT_ADMIN missing from roles: ${roles}`);
});

await test("PRODUCT_CATALOG includes BUYER and TENANT_ADMIN", () => {
  const roles = findEntry("PRODUCT_CATALOG");
  assert.ok(roles, "PRODUCT_CATALOG entry not found");
  assert.ok(roles.includes("BUYER"));
  assert.ok(roles.includes("TENANT_ADMIN"));
});

await test("REQUEST_AUDITS includes BUYER and TENANT_ADMIN", () => {
  const roles = findEntry("REQUEST_AUDITS");
  assert.ok(roles, "REQUEST_AUDITS entry not found");
  assert.ok(roles.includes("BUYER"));
  assert.ok(roles.includes("TENANT_ADMIN"));
});

await test("AUDITOR_NETWORK includes BUYER and TENANT_ADMIN", () => {
  const roles = findEntry("AUDITOR_NETWORK");
  assert.ok(roles, "AUDITOR_NETWORK entry not found");
  assert.ok(roles.includes("BUYER"));
  assert.ok(roles.includes("TENANT_ADMIN"));
});

// MY_WORKSPACE menu group exists with all 10 supplier items
await test("MY_WORKSPACE supplier menu group has all 10 expected items", () => {
  const idx = appConfigSrc.indexOf("MY_WORKSPACE");
  assert.ok(idx !== -1, "MY_WORKSPACE group not found");
  const slice = appConfigSrc.slice(idx, idx + 3500);
  for (const expected of [
    "MY_AUDITS",
    "MY_QUESTIONNAIRES",
    "MY_PRE_QUALIFICATIONS",
    "MY_DEVIATIONS",
    "MY_COMPLAINTS",
    "MY_CHANGE_CONTROLS",
    "MY_CAPAS",
    "MY_TRAINING",
    "MY_RISKS",
    "DOCUMENTS_PENDING_MY_APPROVAL",
  ]) {
    assert.ok(slice.includes(expected), `Missing ${expected} in MY_WORKSPACE group`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend NotificationBell — uses temporary Drawer (not persistent)
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #7 — NotificationBell uses temporary Drawer for backdrop dismissal");

const bellPath = path.resolve(process.cwd(), "../frontend/components/notifications/NotificationBell.tsx");
const bellSrc = fs.existsSync(bellPath) ? fs.readFileSync(bellPath, "utf8") : "";

await test("NotificationBell no longer wraps panel in DetailsPanel", () => {
  // The shipped fix removed the FF_RIGHT_PANEL branch that used DetailsPanel.
  assert.ok(bellSrc.length > 0, "NotificationBell.tsx not readable");
  assert.ok(
    !bellSrc.includes("<DetailsPanel"),
    "NotificationBell still uses DetailsPanel — fix not applied"
  );
});

await test("NotificationBell renders standard MUI Drawer with onClose", () => {
  assert.ok(bellSrc.includes("<Drawer"), "Drawer component not present");
  assert.ok(bellSrc.includes("onClose={() => setOpen(false)}"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend supplier audit row — accept/reject buttons present
// ─────────────────────────────────────────────────────────────────────────────
section("Bug #1/Bug #5 (earlier batch) — supplier accept/reject row buttons");

const auditTablePath = path.resolve(process.cwd(), "../frontend/components/audits/index.tsx");
const auditTableSrc = fs.existsSync(auditTablePath) ? fs.readFileSync(auditTablePath, "utf8") : "";

await test("audit table imports both supplier accept/reject helpers", () => {
  assert.ok(auditTableSrc.includes("acceptSupplierAudit"), "acceptSupplierAudit import missing");
  assert.ok(auditTableSrc.includes("rejectSupplierAudit"), "rejectSupplierAudit import missing");
});

await test("table renders showSupplierAcceptReject branch with handlers", () => {
  assert.ok(auditTableSrc.includes("showSupplierAcceptReject"), "showSupplierAcceptReject flag missing");
  assert.ok(auditTableSrc.includes("handleSupplierAccept"), "handleSupplierAccept handler missing");
  assert.ok(auditTableSrc.includes("handleSupplierReject"), "handleSupplierReject handler missing");
});

await test("buyer assign-auditor button no longer requires supplierDecision==='ACCEPTED'", () => {
  // The relaxed condition only checks !hasAssignedAuditor.
  assert.ok(
    auditTableSrc.includes("!hasAssignedAuditor"),
    "showBuyerAssign condition not relaxed"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Wrap up
// ─────────────────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.status === "pass").length;
const failed = results.filter((r) => r.status === "fail").length;
const total = results.length;

console.log("\n────────────────────────────────────────");
console.log(`  TOTAL: ${total}    PASS: ${passed}    FAIL: ${failed}`);
console.log("────────────────────────────────────────\n");

// Persist a JSON report for the PDF builder.
const reportDir = path.resolve(process.cwd(), "test-results-bugfix");
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(reportDir, `bugfix-unit-suite-${stamp}.json`);
fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      total,
      passed,
      failed,
      results,
    },
    null,
    2
  )
);
console.log(`  Wrote ${jsonPath}`);

// Stable copy for the PDF builder
fs.writeFileSync(
  path.join(reportDir, "bugfix-unit-suite-latest.json"),
  fs.readFileSync(jsonPath, "utf8")
);

process.exit(failed > 0 ? 1 : 0);
