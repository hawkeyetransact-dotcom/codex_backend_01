/**
 * diagnose-auditor-inbox.mjs
 *
 * Run when an auditor reports "I don't see audits assigned to me".
 * Hits the LIVE prod API + queries the DB directly to pinpoint where the
 * assign → see loop is broken.
 *
 * Usage:
 *   node scripts/diagnose-auditor-inbox.mjs
 *   AUDITOR_EMAIL=audit.lead@auditcorp.demo \
 *     PASSWORD=AuditDemo@2026 \
 *     BACKEND=https://hawkeye-backend-dev.vercel.app \
 *     node scripts/diagnose-auditor-inbox.mjs
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "../src/models/userModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";
import { AuditorQualification } from "../src/models/AuditorQualificationModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";

const BACKEND = process.env.BACKEND || "https://hawkeye-backend-dev.vercel.app";
const EMAIL = process.env.AUDITOR_EMAIL || "audit.lead@auditcorp.demo";
const PASSWORD = process.env.PASSWORD || "AuditDemo@2026";

const log = (label, value) => console.log(`  ${label.padEnd(40)} ${value}`);
const heading = (s) => console.log(`\n── ${s} ─────────────────────────────`);

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  heading("STEP 1 — find the auditor user");
  const user = await User.findOne({ email: EMAIL }).lean();
  if (!user) {
    console.log(`  ❌ User not found: ${EMAIL}`);
    process.exit(1);
  }
  log("User _id", user._id);
  log("Role", user.role);
  log("Tenant", user.tenant_id);
  log("Status", user.status);

  heading("STEP 2 — does the auditor have an AuditorProfile?");
  const profile = await AuditorProfile.findOne({ user_id: user._id }).lean();
  if (!profile) {
    console.log(`  ❌ NO AuditorProfile for ${EMAIL}.`);
    console.log(`     Effect: assignAuditors silently skips assignments because`);
    console.log(`     it does AuditorProfile.findOne({user_id}) → null → profileId null → continue.`);
    console.log(`     audit.auditor_id stays null. Auditor never sees the audit.`);
    console.log(`     Fix: re-run scripts/seed-audit-only-users.mjs.`);
  } else {
    log("Profile _id", profile._id);
    log("Affiliation", profile.auditorAffiliation || "(missing)");
    log("Company", profile.companyName);
  }

  heading("STEP 3 — qualification status?");
  const qual = await AuditorQualification.findOne({ auditorUserId: user._id }).lean();
  if (!qual) {
    console.log(`  ❌ NO AuditorQualification for ${EMAIL}.`);
    console.log(`     Effect: G2 /api/auditor/auditors/available filters them OUT,`);
    console.log(`     so the buyer's dropdown won't show them. Buyer can't even pick.`);
  } else {
    log("Qualification status", qual.qualificationStatus);
    log("COI declarations", qual.coiDeclarations?.length ?? 0);
    log("Eligible as lead", qual.eligibleAsLead);
  }

  heading("STEP 4 — audits assigned to this auditor (DB query)");
  const directAudits = await AuditRequestMaster.find({ auditor_id: user._id })
    .select("_id audit_title hawkeyeRequestId trackStatus auditor_id assignedAuditors isArchived supplier_id create_by_buyer_id")
    .lean();
  log("Audits with auditor_id == me", directAudits.length);
  for (const a of directAudits.slice(0, 10)) {
    console.log(`     • ${a.hawkeyeRequestId || a._id}  ${a.audit_title || "(untitled)"}  archived=${!!a.isArchived}  status=${a.trackStatus}`);
  }

  if (profile?._id) {
    const assignedRows = await AuditRequestMaster.find({
      "assignedAuditors.auditorProfileId": profile._id,
    }).select("_id hawkeyeRequestId audit_title auditor_id").lean();
    log("Audits where assignedAuditors[]", `references my profile: ${assignedRows.length}`);
    for (const a of assignedRows.slice(0, 10)) {
      const matches = String(a.auditor_id || "") === String(user._id);
      console.log(`     • ${a.hawkeyeRequestId || a._id}  legacy auditor_id matches: ${matches ? "✅" : "❌ MISMATCH"}`);
    }
  }

  heading("STEP 5 — call live /api/audit-requests/auditor as Maria");
  let token;
  try {
    const res = await fetch(`${BACKEND}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.log(`  ❌ Login failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      token = body.token;
      log("Login OK", `role=${body.role} tenant=${body.tenantId}`);
    }
  } catch (e) {
    console.log(`  ❌ Login error: ${e.message}`);
  }

  if (token) {
    try {
      const res = await fetch(`${BACKEND}/api/audit-requests/auditor?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      log("HTTP status", res.status);
      log("Reported total records", body.totalRecords ?? "?");
      log("Returned rows", body.requests?.length ?? 0);
      const apiIds = (body.requests || []).map((r) => r._id);
      const dbIds = directAudits.map((a) => String(a._id));
      const missing = dbIds.filter((id) => !apiIds.includes(id));
      if (missing.length) {
        console.log(`  ⚠ DB has ${dbIds.length} audits with auditor_id=Maria, API returned ${apiIds.length}`);
        console.log(`     Missing from API: ${missing.join(", ")}`);
        console.log(`     Likely cause: applyArchiveQueryFilter excluding them, or fallback fired.`);
      } else if (apiIds.length === 0 && dbIds.length === 0) {
        console.log(`  ⚠ No audits in DB OR API. Buyer assign-auditor calls have not landed.`);
        console.log(`     Check: deploy status, audit.assignedAuditors[] population, profileId resolution in assignAuditors.`);
      } else {
        console.log(`  ✅ DB and API agree.`);
      }
    } catch (e) {
      console.log(`  ❌ /auditor call error: ${e.message}`);
    }
  }

  heading("STEP 6 — verdict");
  if (!profile) {
    console.log("  → Re-seed: cd backend && node scripts/seed-audit-only-users.mjs");
  } else if (!qual || qual.qualificationStatus !== "QUALIFIED") {
    console.log("  → Re-seed will fix qualification.");
  } else if (directAudits.length === 0) {
    console.log("  → Buyer never successfully assigned. Either Vercel deploy is stale OR");
    console.log("    the assign call returned 200 but 0 assignments matched (silent skip).");
    console.log("    Check the latest assignAuditors call's response in the buyer's browser network tab.");
  } else {
    console.log("  → Auditor SHOULD see audits. If they don't, hard-refresh the front-end.");
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
