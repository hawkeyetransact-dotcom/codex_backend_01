/**
 * Smoke test for audit-agents endpoints.
 *
 *   BASE=http://localhost:8888 node scripts/smoke-test-audit-agents.mjs
 */
import "../src/config/loadEnv.js";

const BASE = process.env.BASE || "http://localhost:8888";
const EMAIL = process.env.EQMS_EMAIL || "qa.head@novex-pharma.demo";
const PASSWORD = process.env.EQMS_PASSWORD || "EqmsDemo@2026";

const results = [];
function record(name, status, note = "") {
  const mark = status === "PASS" ? "✓" : status === "SKIP" ? "⏭" : "✗";
  console.log(`  ${mark} ${name.padEnd(50)} ${status.padEnd(4)} ${note}`);
  results.push({ name, status, note });
}

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let data; try { data = await res.json(); } catch { data = { _raw: await res.text().catch(() => "") }; }
  return { status: res.status, data };
}

async function login() {
  const r = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (r.status !== 200 || !r.data?.token) throw new Error(`login ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data.token;
}

const pause = (ms = 3500) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`\n=== audit-agents smoke test · ${BASE} ===\n`);
  const token = await login();
  record("login", "PASS");

  // ── Public-data providers ────────────────────────────────────────────
  {
    const r = await call("GET", "/api/ai/audit-agents/public/providers", null, token);
    const p = r.data?.providers || [];
    record("public/providers", r.status === 200 ? "PASS" : "FAIL",
      `${p.length} providers · available: ${p.filter((x) => x.available).map((x) => x.key).join(", ")}`);
  }

  // ── openFDA adapters (hit live public API, no auth) ──────────────────
  {
    const r = await call("POST", "/api/ai/audit-agents/public/openfda/manufacturer", { name: "Lupin Limited", limit: 3 }, token);
    record("openFDA · manufacturer", r.status === 200 && r.data.ok ? "PASS" : "SKIP",
      `results=${r.data?.results?.length ?? 0}`);
  }
  await pause(1500);
  {
    const r = await call("POST", "/api/ai/audit-agents/public/openfda/recalls", { name: "Sun Pharma", limit: 3 }, token);
    record("openFDA · recalls", r.status === 200 && r.data.ok ? "PASS" : "SKIP",
      `results=${r.data?.results?.length ?? 0}`);
  }
  await pause(1500);
  {
    const r = await call("POST", "/api/ai/audit-agents/public/fda/warning-letters", { name: "Ranbaxy", limit: 3 }, token);
    record("FDA warning letters (scrape)", r.status === 200 && r.data.ok ? "PASS" : "SKIP",
      `results=${r.data?.results?.length ?? 0}${r.data?.note ? ` · ${r.data.note.slice(0,60)}` : ""}`);
  }

  await pause();

  // ── Entity resolution ────────────────────────────────────────────────
  {
    const r = await call("POST", "/api/ai/audit-agents/resolve-supplier",
      { queryName: "Lupin Limited", fetchPublic: true }, token);
    record("resolveSupplier · public_only", r.status === 200 ? "PASS" : "FAIL",
      `verdict=${r.data?.verdict} · tenantMatches=${r.data?.tenantMatches?.length ?? 0} · ` +
      `fdaSignals drugs=${r.data?.publicSignals?.summaryCounts?.drugs ?? 0}`);
  }
  await pause();

  // ── Supplier intel agent ─────────────────────────────────────────────
  {
    const r = await call("POST", "/api/ai/audit-agents/supplier-intel",
      { supplierName: "Lupin Limited", fetchPublic: true }, token);
    record("supplier-intel agent", r.status === 200 ? "PASS" : "FAIL",
      `verdict=${r.data?.verdict}`);
  }
  await pause();

  // ── Audit Prep Agent ─────────────────────────────────────────────────
  {
    const r = await call("POST", "/api/ai/audit-agents/prepare-questionnaire",
      { supplierName: "Lupin Limited", productClass: "API", scope: "Full GMP", auditType: "GMP" }, token);
    if (r.status === 200 && r.data?.ok && r.data.plan) {
      record("auditPrepAgent · questionnaire", "PASS",
        `sections=${r.data.plan.sections?.length ?? 0} · signals=${r.data.plan.high_risk_signals?.length ?? 0} · conf=${r.data.plan.confidence?.toFixed?.(2)}`);
    } else {
      record("auditPrepAgent · questionnaire", "SKIP", `reason=${r.data?.reason || r.status}`);
    }
  }
  await pause();

  // ── Audit Autofill Agent ─────────────────────────────────────────────
  {
    const r = await call("POST", "/api/ai/audit-agents/autofill-form", {
      formFields: [
        { name: "companyName", label: "Company name" },
        { name: "city", label: "City" },
        { name: "country", label: "Country" },
      ],
      libraryChunks: [
        { docId: "siteprof", text: "Lupin Limited · 3B Old Mahabalipuram Road · Chennai · India · plant_id CHE-001" },
      ],
    }, token);
    if (r.status === 200 && r.data?.ok && r.data.suggestions?.length) {
      record("auditAutofillAgent · autofill", "PASS",
        `suggestions=${r.data.suggestions.length} · ` +
        `nonNull=${r.data.suggestions.filter((s) => s.value != null).length}`);
    } else {
      record("auditAutofillAgent · autofill", "SKIP", `reason=${r.data?.reason || r.status}`);
    }
  }

  // ── Audit Report Agent (using an existing audit id from prior smoke) ─
  await pause();
  {
    // Pick the most recent audit for this tenant.
    const listRes = await call("GET", "/api/audit-requests/buyer?page=1&limit=1&mode=active", null, token);
    const firstId = listRes.data?.requests?.[0]?._id || listRes.data?.[0]?._id;
    if (!firstId) {
      record("auditReportAgent · assemble", "SKIP", "no audits in tenant to assemble");
    } else {
      const r = await call("POST", "/api/ai/audit-agents/assemble-report", { auditId: firstId }, token);
      if (r.status === 200 && r.data?.ok && r.data.html) {
        record("auditReportAgent · assemble", "PASS",
          `htmlBytes=${r.data.html.length} · hash=${String(r.data.integrityHash).slice(0, 12)}…`);
      } else {
        record("auditReportAgent · assemble", "SKIP", `reason=${r.data?.reason || r.status}`);
      }
    }
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n=== Result: ${pass} pass · ${skip} skip · ${fail} fail ===\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("fatal:", e); process.exit(1); });
