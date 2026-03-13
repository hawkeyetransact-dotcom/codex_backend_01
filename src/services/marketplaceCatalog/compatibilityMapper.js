export const mapCatalogProductToLegacyCandidate = (product) => ({
  id: String(product?._id || ""),
  productName: product?.canonicalName || "",
  casNumber: product?.identifiers?.cas || "",
  description: product?.description || "",
  listingType: product?.listingType || "API",
  verificationStatus: product?.verificationStatus || "review_required",
});

export const mapMarketplaceClaimToLegacyShape = (claim) => ({
  id: String(claim?._id || ""),
  productName: claim?.catalogProduct?.canonicalName || "",
  casNumber: claim?.catalogProduct?.identifiers?.cas || "",
  description: claim?.catalogProduct?.description || "",
  listingType: claim?.catalogProduct?.listingType || "API",
  verificationStatus: claim?.verificationStatus || "claimed",
  claimStatus: claim?.claimStatus || "draft",
  supplierRole: claim?.supplierRole || [],
  siteCount: Array.isArray(claim?.sites) ? claim.sites.length : 0,
  evidenceCount: Number(claim?.evidenceCount || 0),
});
