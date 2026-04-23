/**
 * Supplier Intel Agent.
 *
 * Convenience wrapper that combines entity resolution + public data fusion
 * into a single dossier-style output for UI consumption. Replaces the Wave 2
 * supplierRiskDossier (which used only FDA models in Mongo) with the public
 * data feeds from openFDA / warning letters, tagged for provenance.
 */
import { resolveSupplier } from "./entityResolutionService.js";

export async function compileSupplierIntel({ tenantId, supplierId, supplierName, fetchPublic = true }) {
  const resolved = await resolveSupplier({
    tenantId,
    queryName: supplierName,
    knownSupplierId: supplierId,
    fetchPublic,
  });

  return {
    queryName: resolved.queryName,
    verdict: resolved.verdict,
    provenanceNote: resolved.provenanceNote,
    tenant: {
      bestMatch: resolved.bestTenantMatch,
      allMatches: resolved.tenantMatches,
    },
    public: resolved.publicSignals || null,
    generatedAt: new Date().toISOString(),
  };
}
