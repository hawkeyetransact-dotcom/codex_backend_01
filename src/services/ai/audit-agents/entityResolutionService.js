/**
 * Entity Resolution Service.
 *
 * Given an input identifier (name, DUNS, FEI, email domain), resolves it
 * against the tenant's registered records AND public signals, returning a
 * unified view with explicit provenance tagging (`tenant` / `public` /
 * `inferred` / `unknown`) for every data point.
 *
 * This is what differentiates Hawkeye's view from a raw public search:
 * users always see "this comes from YOUR records" vs "this is from a public
 * source and may not reflect the entity you registered with us".
 */
import mongoose from "mongoose";
import { provenanced, normaliseName, nameSimilarity } from "./_shared.js";
import { compilePublicSupplierSignals } from "./publicDataFusionService.js";

const MATCH_THRESHOLD = 0.78;

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

/**
 * Resolve a supplier entity.
 * @returns {Promise<{
 *   queryName: string,
 *   tenantMatches: Array<{recordId, name, similarity, fields: object}>,
 *   bestTenantMatch: object|null,
 *   publicSignals: object,
 *   verdict: "known_tenant" | "public_only" | "ambiguous" | "unknown",
 *   provenanceNote: string,
 * }>}
 */
export async function resolveSupplier({ tenantId, queryName, knownSupplierId, fetchPublic = true }) {
  if (!tenantId) throw new Error("resolveSupplier: tenantId required");
  if (!queryName && !knownSupplierId) throw new Error("resolveSupplier: queryName or knownSupplierId required");

  // Stage 1 — tenant lookup.
  let tenantMatches = [];
  let bestTenantMatch = null;

  const SupplierProfile = modelByName("supplier-profiles") || modelByName("SupplierProfile");
  const User = modelByName("users") || modelByName("User");

  if (SupplierProfile) {
    const tenantNameFilter = queryName
      ? { companyName: { $regex: new RegExp(escapeRegex(queryName).slice(0, 30), "i") } }
      : {};
    const idFilter = knownSupplierId
      ? { $or: [{ _id: safeOid(knownSupplierId) }, { user_id: safeOid(knownSupplierId) }] }
      : {};
    const profiles = await SupplierProfile.find({
      tenant_id: tenantId,
      ...(knownSupplierId ? idFilter : tenantNameFilter),
    }).limit(10).lean().catch(() => []);

    for (const p of profiles) {
      const sim = queryName ? nameSimilarity(p.companyName || "", queryName) : 1.0;
      if (knownSupplierId || sim >= MATCH_THRESHOLD) {
        tenantMatches.push({
          recordId: String(p._id),
          name: p.companyName || "(unnamed)",
          similarity: sim,
          fields: {
            companyName: provenanced(p.companyName, "tenant", { confidence: 1, ref: String(p._id) }),
            address: provenanced(
              [p.addressline1, p.city, p.state, p.country].filter(Boolean).join(", "),
              "tenant",
              { confidence: 1, ref: String(p._id) }
            ),
            phone: p.phone ? provenanced(p.phone, "tenant", { confidence: 1, ref: String(p._id) }) : null,
            userId: p.user_id ? String(p.user_id) : null,
          },
        });
      }
    }
    tenantMatches.sort((a, b) => b.similarity - a.similarity);
    bestTenantMatch = tenantMatches[0] || null;
  }

  // Stage 2 — public signals for the name (even if we found a tenant match —
  // users still want to see what the world says about this entity).
  let publicSignals = null;
  if (fetchPublic && queryName) {
    publicSignals = await compilePublicSupplierSignals({ name: queryName }).catch((e) => ({
      ok: false,
      error: e.message,
    }));
  }

  // Stage 3 — verdict.
  let verdict;
  let provenanceNote;
  if (bestTenantMatch && bestTenantMatch.similarity >= 0.95) {
    verdict = "known_tenant";
    provenanceNote = `Matched your registered supplier "${bestTenantMatch.name}" (similarity ${bestTenantMatch.similarity.toFixed(2)}). Public signals shown for context only.`;
  } else if (bestTenantMatch && bestTenantMatch.similarity >= MATCH_THRESHOLD) {
    verdict = "ambiguous";
    provenanceNote = `Possible match to "${bestTenantMatch.name}" (similarity ${bestTenantMatch.similarity.toFixed(2)}). Confirm before acting.`;
  } else if (publicSignals && (publicSignals.summaryCounts?.drugs || publicSignals.summaryCounts?.recalls)) {
    verdict = "public_only";
    provenanceNote = `Not in your supplier registry. Public data found — this entity is NOT one of your qualified suppliers.`;
  } else {
    verdict = "unknown";
    provenanceNote = `No tenant match, no public data. Treat as unverified.`;
  }

  return {
    queryName: queryName || knownSupplierId,
    tenantMatches,
    bestTenantMatch,
    publicSignals,
    verdict,
    provenanceNote,
  };
}

function escapeRegex(s) { return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function safeOid(s) { try { return new mongoose.Types.ObjectId(String(s)); } catch { return null; } }
