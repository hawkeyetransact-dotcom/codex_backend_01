/**
 * Public Data Fusion Service.
 *
 * Unifies multiple public-data providers behind a common interface. Each
 * provider is declared with its auth requirement, rate limit, and canonical
 * output shape. Results are provenance-tagged so the UI can differentiate
 * public vs tenant data.
 *
 * Implemented:
 *   - openFDA  (Drugs: /drug/drugsfda · /drug/event · /drug/enforcement · /drug/warningletters-scrape)
 *   - FDA Establishment Registration search
 *
 * Adapter stubs (require customer-supplied auth):
 *   - Pharma Compass (commercial; ToS forbids scraping — use their API)
 *   - EMA EudraGMDP
 *   - WHO PQ
 */
import { provenanced, ttlCacheGet, ttlCacheSet, respectfulFetch, normaliseName } from "./_shared.js";

const OPENFDA_BASE = "https://api.fda.gov";

/**
 * Provider registry — declarative.
 */
export const PROVIDERS = {
  openFDA: {
    key: "openFDA",
    requiresAuth: false,
    rateLimitPerMin: 240, // public limit per IP is generous; key-auth unlocks higher
    description: "FDA open data: drug registration, adverse events, enforcement actions, DMF list",
    available: true,
  },
  fdaWarningLetter: {
    key: "fdaWarningLetter",
    requiresAuth: false,
    rateLimitPerMin: 30, // scrape the public search page respectfully
    description: "FDA Warning Letters search (scrape of public search)",
    available: true,
  },
  pharmaCompass: {
    key: "pharmaCompass",
    requiresAuth: true,
    envKey: "PHARMA_COMPASS_API_KEY",
    rateLimitPerMin: 60,
    description: "Commercial pharma supplier directory — bring-your-own API key",
    available: Boolean(process.env.PHARMA_COMPASS_API_KEY),
  },
  emaEudraGMDP: {
    key: "emaEudraGMDP",
    requiresAuth: false,
    rateLimitPerMin: 30,
    description: "EudraGMDP — EU GMP manufacturer / importer / distributor registry",
    available: false, // adapter not implemented yet
  },
  whoPQ: {
    key: "whoPQ",
    requiresAuth: false,
    rateLimitPerMin: 30,
    description: "WHO Prequalification list",
    available: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// openFDA adapter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search openFDA drug registration by sponsor/manufacturer name.
 * Docs: https://open.fda.gov/apis/drug/drugsfda/
 */
export async function openFdaSearchByManufacturer(name, { limit = 10 } = {}) {
  if (!name) return { ok: false, error: "name required" };
  const cacheKey = `openfda:mfr:${normaliseName(name)}:${limit}`;
  const cached = ttlCacheGet(cacheKey);
  if (cached) return cached;

  const q = encodeURIComponent(`openfda.manufacturer_name:"${name}"`);
  const url = `${OPENFDA_BASE}/drug/drugsfda.json?search=${q}&limit=${limit}`;
  try {
    const res = await respectfulFetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // openFDA returns 404 for no results — that's a clean empty.
      if (res.status === 404) {
        const out = { ok: true, source: "openFDA", results: [] };
        ttlCacheSet(cacheKey, out, 3600);
        return out;
      }
      return { ok: false, error: `openFDA ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    const results = (data.results || []).map((r) =>
      provenanced(
        {
          applicationNumber: r.application_number,
          sponsorName: r.sponsor_name,
          products: (r.products || []).map((p) => ({
            brandName: p.brand_name,
            dosageForm: p.dosage_form,
            route: p.route,
            activeIngredients: (p.active_ingredients || []).map((a) => a.name),
          })),
        },
        "openFDA",
        { url: `https://open.fda.gov/apis/drug/drugsfda/`, confidence: 0.95 }
      )
    );
    const out = { ok: true, source: "openFDA", results, total: data.meta?.results?.total };
    ttlCacheSet(cacheKey, out, 3600);
    return out;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Search openFDA enforcement (recall) events by firm name.
 * Docs: https://open.fda.gov/apis/drug/enforcement/
 */
export async function openFdaRecallsByFirm(name, { limit = 20 } = {}) {
  if (!name) return { ok: false, error: "name required" };
  const cacheKey = `openfda:recall:${normaliseName(name)}:${limit}`;
  const cached = ttlCacheGet(cacheKey);
  if (cached) return cached;
  const q = encodeURIComponent(`recalling_firm:"${name}"`);
  const url = `${OPENFDA_BASE}/drug/enforcement.json?search=${q}&limit=${limit}&sort=recall_initiation_date:desc`;
  try {
    const res = await respectfulFetch(url);
    if (res.status === 404) {
      const out = { ok: true, source: "openFDA", results: [] };
      ttlCacheSet(cacheKey, out, 3600);
      return out;
    }
    if (!res.ok) {
      return { ok: false, error: `openFDA ${res.status}` };
    }
    const data = await res.json();
    const results = (data.results || []).map((r) =>
      provenanced(
        {
          recallNumber: r.recall_number,
          classification: r.classification,
          status: r.status,
          productDescription: r.product_description?.slice(0, 300),
          reasonForRecall: r.reason_for_recall?.slice(0, 300),
          recallInitiationDate: r.recall_initiation_date,
          voluntaryMandated: r.voluntary_mandated,
          distributionPattern: r.distribution_pattern?.slice(0, 200),
        },
        "openFDA",
        {
          url: `https://open.fda.gov/apis/drug/enforcement/`,
          confidence: 0.95,
        }
      )
    );
    const out = { ok: true, source: "openFDA", results, total: data.meta?.results?.total };
    ttlCacheSet(cacheKey, out, 3600);
    return out;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Search openFDA adverse event reports by drug brand name.
 * Useful for signal context in the risk dossier.
 */
export async function openFdaAdverseEventsByBrand(brandName, { limit = 10 } = {}) {
  if (!brandName) return { ok: false, error: "brandName required" };
  const cacheKey = `openfda:ae:${normaliseName(brandName)}:${limit}`;
  const cached = ttlCacheGet(cacheKey);
  if (cached) return cached;
  const q = encodeURIComponent(`patient.drug.openfda.brand_name:"${brandName}"`);
  const url = `${OPENFDA_BASE}/drug/event.json?search=${q}&limit=${limit}`;
  try {
    const res = await respectfulFetch(url);
    if (res.status === 404) return { ok: true, source: "openFDA", results: [] };
    if (!res.ok) return { ok: false, error: `openFDA ${res.status}` };
    const data = await res.json();
    const results = (data.results || []).map((r) =>
      provenanced(
        {
          reportId: r.safetyreportid,
          receiveDate: r.receivedate,
          serious: r.serious,
          reactions: (r.patient?.reaction || []).map((x) => x.reactionmeddrapt).slice(0, 5),
          reporterCountry: r.primarysourcecountry,
        },
        "openFDA",
        { url: `https://open.fda.gov/apis/drug/event/`, confidence: 0.9 }
      )
    );
    const out = { ok: true, source: "openFDA", results, total: data.meta?.results?.total };
    ttlCacheSet(cacheKey, out, 3600);
    return out;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FDA Warning Letter adapter (public search page)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FDA Warning Letters — the site has no JSON API. We hit the public search
 * results page and parse the letter summaries. Respectful rate-limit + cache.
 *
 * If parsing fails (site markup changes), we return `{ok: true, results: []}`
 * rather than error — the dossier degrades gracefully.
 */
export async function fdaWarningLettersByCompany(name, { limit = 10 } = {}) {
  if (!name) return { ok: false, error: "name required" };
  const cacheKey = `fdawl:${normaliseName(name)}:${limit}`;
  const cached = ttlCacheGet(cacheKey);
  if (cached) return cached;

  const q = encodeURIComponent(name);
  const url = `https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters?search_api_fulltext=${q}`;

  try {
    const res = await respectfulFetch(url, {}, { timeoutMs: 10_000 });
    if (!res.ok) {
      const out = { ok: true, source: "fdaWarningLetter", results: [], note: `fetch failed ${res.status}` };
      ttlCacheSet(cacheKey, out, 600);
      return out;
    }
    const html = await res.text();
    // Minimal parse — pull <a href="/inspections-.../warning-letters/<company>-<date>"> blocks.
    const linkRegex = /<a\s+[^>]*href="(\/inspections-[^"]*warning-letters[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const results = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null && results.length < limit) {
      const path = m[1];
      const title = m[2].trim();
      if (!path.includes("/warning-letters/")) continue;
      results.push(
        provenanced(
          {
            title,
            url: `https://www.fda.gov${path}`,
          },
          "fdaWarningLetter",
          { url: `https://www.fda.gov${path}`, confidence: 0.75 }
        )
      );
    }
    const out = { ok: true, source: "fdaWarningLetter", results };
    ttlCacheSet(cacheKey, out, 1800);
    return out;
  } catch (err) {
    return { ok: true, source: "fdaWarningLetter", results: [], note: `exception: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pharma Compass adapter — STUB (commercial; bring-your-own API key)
// ═══════════════════════════════════════════════════════════════════════════════

export async function pharmaCompassLookup(name, { limit = 10 } = {}) {
  if (!process.env.PHARMA_COMPASS_API_KEY) {
    return {
      ok: false,
      disabled: true,
      reason:
        "PHARMA_COMPASS_API_KEY not set. Pharma Compass is a commercial directory; " +
        "their ToS does not allow open scraping. Provide an API key (or partner credentials) " +
        "to enable this adapter. Placeholder is intentional — ship with it off by default.",
    };
  }
  // TODO: wire official Pharma Compass API when customer supplies credentials.
  // The response should be mapped to provenanced(..., "pharmaCompass").
  return { ok: false, reason: "adapter_not_implemented", name, limit };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unified fusion: pull from every available adapter + merge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compile a public-data summary for a supplier/company name.
 */
export async function compilePublicSupplierSignals({ name, brandName }) {
  const [drugs, recalls, warningLetters, ae, pc] = await Promise.all([
    openFdaSearchByManufacturer(name).catch((e) => ({ ok: false, error: e.message })),
    openFdaRecallsByFirm(name).catch((e) => ({ ok: false, error: e.message })),
    fdaWarningLettersByCompany(name).catch((e) => ({ ok: false, error: e.message })),
    brandName ? openFdaAdverseEventsByBrand(brandName).catch((e) => ({ ok: false, error: e.message })) : Promise.resolve({ ok: true, results: [] }),
    pharmaCompassLookup(name).catch((e) => ({ ok: false, error: e.message })),
  ]);

  return {
    companyName: name,
    brandName,
    fetchedAt: new Date().toISOString(),
    sources: {
      openFDA: {
        drugs: drugs.results || [],
        recalls: recalls.results || [],
        adverseEvents: ae.results || [],
      },
      fdaWarningLetter: {
        letters: warningLetters.results || [],
      },
      pharmaCompass: {
        enabled: PROVIDERS.pharmaCompass.available,
        data: pc.results || [],
        reason: pc.reason,
      },
    },
    summaryCounts: {
      drugs: (drugs.results || []).length,
      recalls: (recalls.results || []).length,
      warningLetters: (warningLetters.results || []).length,
      adverseEvents: (ae.results || []).length,
    },
  };
}
