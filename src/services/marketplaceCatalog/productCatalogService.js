import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { SupplierProfile } from "../../models/supplierProfileModel.js";
import { SupplierSite } from "../../models/supplierSiteDataModel.js";
import {
  CatalogProduct,
  CatalogProductVariant,
  ComplianceClaimRecordV2,
  ProductEvidenceLinkV2,
  ProductMergeEventV2,
  ProductProvenanceEventV2,
  ProductRefreshRunV2,
  ProductReviewQueueV2,
  SupplierProductClaimV2,
  SupplierProductOfferV2,
  SupplierProductSiteLinkV2,
} from "../../models/productCatalogV2Models.js";
import { ApiMaster } from "../../models/apiMasterModel.js";
import { DigiLockerDocument } from "../../models/digilockerDocumentModel.js";
import { Organization } from "../../models/organizationModel.js";
import {
  mapCatalogProductToLegacyCandidate,
  mapMarketplaceClaimToLegacyShape,
} from "./compatibilityMapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const normalizeToken = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildSearchKeywords = (payload = {}) => {
  const keywords = new Set();
  [payload.canonicalName, ...(payload.synonyms || []), payload.identifiers?.cas, payload.identifiers?.inn]
    .filter(Boolean)
    .forEach((value) => keywords.add(normalizeToken(value)));
  return Array.from(keywords).filter(Boolean);
};

const readJsonAsset = (relativePath) => {
  const fullPath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
};

const normalizeSourceEntry = (source = {}) => ({
  sourceName: source.sourceName || source.source_name || "marketplace_form",
  sourceUrl: source.sourceUrl || source.url || source.source_url || "",
  fetchedAtUtc: source.fetchedAtUtc || source.fetched_at || source.fetchedAt || new Date(),
  parserVersion: source.parserVersion || source.parser_version || "1.0.0",
  confidenceScore: source.confidenceScore ?? source.confidence ?? 1,
  rawSnippetRef: source.rawSnippetRef || source.raw_snippet_ref || "",
  claimOrigin: source.claimOrigin || source.claim_origin || "supplier_submission",
  verificationStatus: source.verificationStatus || source.verification_status || "claimed",
});

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.toString === "function") return value.toString();
  return "";
};

const isSameId = (left, right) => {
  const leftId = toIdString(left);
  const rightId = toIdString(right);
  return Boolean(leftId) && Boolean(rightId) && leftId === rightId;
};

const uniqStrings = (values = []) => Array.from(new Set(values.filter(Boolean)));

const buildComplianceSummary = (records = []) => {
  const claimed = new Set();
  const verified = new Set();

  for (const record of records) {
    if (!record?.claimType) continue;
    claimed.add(record.claimType);
    if (record.verificationStatus === "verified") verified.add(record.claimType);
  }

  return {
    claimed: Array.from(claimed).sort(),
    verified: Array.from(verified).sort(),
  };
};

const buildSourceBreakdown = (sourceSummary = [], provenanceEvents = []) => {
  const all = [
    ...(Array.isArray(sourceSummary) ? sourceSummary : []),
    ...(Array.isArray(provenanceEvents) ? provenanceEvents : []),
  ];
  const official = all.filter(
    (entry) =>
      entry?.claimOrigin === "registry_verification" ||
      String(entry?.sourceName || "").toLowerCase().includes("fda") ||
      String(entry?.sourceName || "").toLowerCase().includes("edqm") ||
      String(entry?.sourceName || "").toLowerCase().includes("eudra")
  );
  return {
    totalSources: all.length,
    officialSourceCount: official.length,
    latestFetchedAt:
      all
        .map((entry) => entry?.fetchedAtUtc || entry?.fetched_at || entry?.fetchedAt)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null,
  };
};

const normalizeVisibility = (value) => {
  if (value === "public" || value === "registered" || value === "private") return value;
  return "private";
};

const isVisibleMarketplaceClaim = (bundle, actor = {}) => {
  const sameTenant = isSameId(bundle?.claim?.tenantId, actor?.tenantId);
  if (sameTenant) {
    return bundle?.claim?.claimStatus !== "rejected";
  }

  const visibility = normalizeVisibility(bundle?.offer?.visibility);
  if (!["registered", "public"].includes(visibility)) return false;
  return bundle?.claim?.claimStatus === "active";
};

const extractSiteSnapshot = (siteLink = {}) => {
  const site = siteLink?.siteId;
  return {
    id: toIdString(site?._id || site || siteLink?.orgSiteId),
    name: site?.site_name || siteLink?.addressSnapshot?.address1 || "Unspecified site",
    plantId: site?.plant_id || "",
    city: site?.city || siteLink?.addressSnapshot?.city || "",
    country: site?.country || siteLink?.addressSnapshot?.country || "",
    roles: siteLink?.roles || [],
    verificationStatus: siteLink?.verificationStatus || "claimed",
  };
};

const hydrateClaimBundles = async (claims = [], actor = {}) => {
  if (!claims.length) return [];

  const claimIds = claims.map((claim) => claim._id);
  const orgIds = uniqStrings(claims.map((claim) => toIdString(claim.ownerOrgId)));

  const [offers, siteLinks, complianceRecords, evidenceLinks, organizations] = await Promise.all([
    SupplierProductOfferV2.find({ claimId: { $in: claimIds } }).lean(),
    SupplierProductSiteLinkV2.find({ claimId: { $in: claimIds } })
      .populate("siteId", "site_name plant_id country city")
      .lean(),
    ComplianceClaimRecordV2.find({ claimId: { $in: claimIds } }).lean(),
    ProductEvidenceLinkV2.find({ claimId: { $in: claimIds } }).lean(),
    orgIds.length ? Organization.find({ _id: { $in: orgIds } }).lean() : [],
  ]);

  const offerByClaim = new Map(offers.map((offer) => [toIdString(offer.claimId), offer]));
  const orgById = new Map(organizations.map((org) => [toIdString(org._id), org]));

  const siteLinksByClaim = new Map();
  for (const siteLink of siteLinks) {
    const key = toIdString(siteLink.claimId);
    if (!siteLinksByClaim.has(key)) siteLinksByClaim.set(key, []);
    siteLinksByClaim.get(key).push(siteLink);
  }

  const complianceByClaim = new Map();
  for (const complianceRecord of complianceRecords) {
    const key = toIdString(complianceRecord.claimId);
    if (!complianceByClaim.has(key)) complianceByClaim.set(key, []);
    complianceByClaim.get(key).push(complianceRecord);
  }

  const evidenceByClaim = new Map();
  for (const evidenceLink of evidenceLinks) {
    const key = toIdString(evidenceLink.claimId);
    if (!evidenceByClaim.has(key)) evidenceByClaim.set(key, []);
    evidenceByClaim.get(key).push(evidenceLink);
  }

  return claims
    .map((claim) => {
      const claimId = toIdString(claim._id);
      const offer = offerByClaim.get(claimId) || null;
      const organization = claim.ownerOrgId ? orgById.get(toIdString(claim.ownerOrgId)) || null : null;
      const sites = (siteLinksByClaim.get(claimId) || []).map(extractSiteSnapshot);
      const compliance = complianceByClaim.get(claimId) || [];
      const evidence = evidenceByClaim.get(claimId) || [];

      return {
        claim,
        organization,
        offer,
        sites,
        compliance,
        evidence,
        complianceSummary: buildComplianceSummary(compliance),
      };
    })
    .filter((bundle) => isVisibleMarketplaceClaim(bundle, actor));
};

const buildSupplierCard = (bundle = {}) => {
  const supplierName =
    bundle?.organization?.displayName ||
    bundle?.organization?.legalName ||
    bundle?.claim?.supplierNameSnapshot ||
    "Unknown supplier";
  const visibility = normalizeVisibility(bundle?.offer?.visibility);
  const primaryCountry =
    bundle?.offer?.trade?.countryOfOrigin ||
    bundle?.sites?.find((site) => site?.country)?.country ||
    bundle?.organization?.headquarters?.country ||
    "";

  return {
    claimId: bundle?.claim?._id,
    supplierName,
    supplierRoles: bundle?.claim?.supplierRole || [],
    claimStatus: bundle?.claim?.claimStatus || "draft",
    verificationStatus: bundle?.claim?.verificationStatus || "claimed",
    supplierOrg: bundle?.organization
      ? {
          id: bundle.organization._id,
          legalName: bundle.organization.legalName,
          displayName: bundle.organization.displayName,
          website: bundle.organization.website,
          supplyChainRoles: bundle.organization.supplyChainRoles || [],
        }
      : null,
    offer: bundle?.offer
      ? {
          visibility,
          offerStatus: bundle.offer.offerStatus || "draft",
          specReference: bundle.offer.quality?.specReference || "",
          countryOfOrigin: bundle.offer.trade?.countryOfOrigin || "",
          hsCode: bundle.offer.trade?.hsCode || "",
          moq: bundle.offer.supply?.moq || null,
          leadTimeDays: bundle.offer.supply?.leadTimeDays || null,
          price: bundle.offer.supply?.price || null,
        }
      : null,
    primaryCountry,
    sites: bundle?.sites || [],
    evidenceCount: Array.isArray(bundle?.evidence) ? bundle.evidence.length : 0,
    evidenceDocTypes: uniqStrings((bundle?.evidence || []).map((item) => item.docType)),
    compliance: bundle?.complianceSummary || { claimed: [], verified: [] },
  };
};

const buildMarketplaceSummary = (product = {}, bundles = []) => {
  const supplierNames = uniqStrings(bundles.map((bundle) => buildSupplierCard(bundle).supplierName));
  const sites = bundles.flatMap((bundle) => bundle.sites || []);
  const complianceClaims = uniqStrings(
    bundles.flatMap((bundle) => bundle.complianceSummary?.claimed || [])
  );
  const verifiedComplianceClaims = uniqStrings(
    bundles.flatMap((bundle) => bundle.complianceSummary?.verified || [])
  );
  const sourceBreakdown = buildSourceBreakdown(product?.sourceSummary || [], []);

  return {
    visibleSupplierCount: supplierNames.length,
    visibleSiteCount: uniqStrings(sites.map((site) => `${site.name}|${site.country}|${site.plantId}`)).length,
    visibleEvidenceCount: bundles.reduce(
      (total, bundle) => total + (Array.isArray(bundle?.evidence) ? bundle.evidence.length : 0),
      0
    ),
    verifiedClaimCount: bundles.filter((bundle) => bundle?.claim?.verificationStatus === "verified").length,
    publicOfferCount: bundles.filter((bundle) => normalizeVisibility(bundle?.offer?.visibility) === "public")
      .length,
    registeredOfferCount: bundles.filter(
      (bundle) => normalizeVisibility(bundle?.offer?.visibility) === "registered"
    ).length,
    supplierNames: supplierNames.slice(0, 5),
    supplierCountries: uniqStrings(
      bundles
        .map((bundle) =>
          bundle?.offer?.trade?.countryOfOrigin ||
          bundle?.sites?.find((site) => site.country)?.country ||
          bundle?.organization?.headquarters?.country
        )
        .filter(Boolean)
    ),
    complianceClaims,
    verifiedComplianceClaims,
    specReferences: uniqStrings(
      bundles.map((bundle) => bundle?.offer?.quality?.specReference || bundle?.offer?.specReference).filter(Boolean)
    ),
    sourceBreakdown,
  };
};

export const getFormSchemaAsset = () => readJsonAsset("schemas/product_form.schema.json");
export const getFormUiAsset = () => readJsonAsset("ui/product_form.ui.json");
export const getSourceManifestAsset = () => readJsonAsset("sources/source_manifest.json");

export const suggestCatalogMatches = async ({
  listingType,
  canonicalName,
  identifiers = {},
}) => {
  const normalizedName = normalizeToken(canonicalName);
  const or = [];
  if (identifiers.cas) or.push({ "identifiers.cas": identifiers.cas });
  if (identifiers.productNdc) or.push({ "identifiers.productNdc": identifiers.productNdc });
  if (identifiers.inn) or.push({ "identifiers.inn": identifiers.inn });
  if (normalizedName) or.push({ normalizedName });

  if (!or.length) return [];

  const docs = await CatalogProduct.find({
    listingType,
    $or: or,
  })
    .limit(10)
    .lean();

  return docs.map((doc) => {
    let score = 0.5;
    if (identifiers.cas && identifiers.cas === doc?.identifiers?.cas) score = 0.98;
    else if (
      identifiers.productNdc &&
      identifiers.productNdc === doc?.identifiers?.productNdc
    )
      score = 0.99;
    else if (normalizedName && normalizedName === doc?.normalizedName) score = 0.92;
    return { ...doc, matchScore: score };
  });
};

export const ensureCatalogProduct = async (payload, actor = {}) => {
  const normalizedName = normalizeToken(payload.canonicalName);
  const identifiers = payload.identifiers || {};
  const normalizedSources = (payload.provenance?.sources || []).map(normalizeSourceEntry);
  const matches = await suggestCatalogMatches({
    listingType: payload.listingType,
    canonicalName: payload.canonicalName,
    identifiers,
  });
  const top = matches.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];
  if (top && (top.matchScore || 0) >= 0.92) {
    const updated = await CatalogProduct.findByIdAndUpdate(
      top._id,
      {
        $set: {
          description: payload.description || top.description || "",
          verificationStatus: top.verificationStatus || "review_required",
          sourceLastFetchedAt: new Date(),
          searchKeywords: Array.from(new Set([...(top.searchKeywords || []), ...buildSearchKeywords(payload)])),
        },
        $inc: { normalizedRecordVersion: 1 },
      },
      { new: true }
    );
    return { product: updated, created: false, matchScore: top.matchScore };
  }

  const product = await CatalogProduct.create({
    listingType: payload.listingType,
    canonicalName: payload.canonicalName,
    normalizedName,
    synonyms: payload.synonyms || [],
    description: payload.description || "",
    identifiers: identifiers,
    fdf: payload.fdf || {},
    quality: payload.quality || {},
    storage: payload.stability || {},
    verificationStatus: payload.verificationStatus || "review_required",
    sourcePriority: payload.sourcePriority || 100,
    sourceLastFetchedAt: new Date(),
    sourceRecordHash: payload.sourceRecordHash || "",
    refreshStatus: "ready",
    refreshStrategy: payload.refreshStrategy || "manual_review",
    sourceSummary: normalizedSources,
    searchKeywords: buildSearchKeywords(payload),
  });

  await ProductProvenanceEventV2.create({
    resourceType: "catalog_product",
    resourceId: product._id,
    fieldPath: "/",
    sourceName: normalizedSources[0]?.sourceName || "marketplace_form",
    sourceUrl: normalizedSources[0]?.sourceUrl || "",
    confidenceScore: normalizedSources[0]?.confidenceScore || 1,
    claimOrigin: normalizedSources[0]?.claimOrigin || "supplier_submission",
    verificationStatus: normalizedSources[0]?.verificationStatus || "claimed",
    sourceRecordHash: payload.sourceRecordHash || "",
  });

  if (payload.variant) {
    await CatalogProductVariant.findOneAndUpdate(
      { catalogProductId: product._id, variantKey: payload.variant.variantKey },
      { $set: payload.variant },
      { upsert: true, new: true }
    );
  }

  return { product, created: true, matchScore: top?.matchScore || 0 };
};

export const createSupplierClaim = async (payload, actor = {}) => {
  const supplierProfile = actor.userId
    ? await SupplierProfile.findOne({ user_id: actor.userId }).lean()
    : null;

  const claim = await SupplierProductClaimV2.findOneAndUpdate(
    {
      tenantId: actor.tenantId,
      supplierUserId: actor.userId,
      catalogProductId: payload.catalogProductId,
      variantId: payload.variantId || null,
    },
    {
      $set: {
        ownerOrgId: payload.ownerOrgId || actor.ownerOrgId || null,
        supplierProfileId: supplierProfile?._id || null,
        supplierRole: payload.supplierRole || [],
        claimStatus: payload.claimStatus || "active",
        verificationStatus: payload.verificationStatus || "claimed",
        supplierNameSnapshot: payload.supplierName || supplierProfile?.companyName || "",
        commercialReady: Boolean(payload.offer),
      },
    },
    { upsert: true, new: true }
  );

  let siteLinks = [];
  if (Array.isArray(payload.siteIds) && payload.siteIds.length) {
    const sites = await SupplierSite.find({ _id: { $in: payload.siteIds }, user_id: actor.userId }).lean();
    siteLinks = await Promise.all(
      sites.map((site) =>
        SupplierProductSiteLinkV2.findOneAndUpdate(
          { claimId: claim._id, siteId: site._id },
          {
            $set: {
              tenantId: actor.tenantId,
              supplierUserId: actor.userId,
              siteId: site._id,
              orgSiteId: payload.orgSiteId || null,
              roles: payload.siteRoles?.[site._id?.toString?.()] || payload.roles || [],
              addressSnapshot: {
                address1: site.address_line1 || "",
                address2: site.address_line2 || "",
                city: site.city || "",
                state: site.state || "",
                postalCode: site.zipcode || "",
                country: site.country || "",
              },
            },
          },
          { upsert: true, new: true }
        )
      )
    );
  }

  let offer = null;
  if (payload.offer) {
    offer = await SupplierProductOfferV2.findOneAndUpdate(
      { claimId: claim._id },
      {
        $set: {
          tenantId: actor.tenantId,
          visibility: payload.offer.visibility || "private",
          offerStatus: payload.offer.offerStatus || "active",
          quality: payload.offer.quality || {},
          packaging: payload.offer.packaging || {},
          supply: payload.offer.supply || {},
          trade: payload.offer.trade || {},
        },
      },
      { upsert: true, new: true }
    );
  }

  const complianceRecords = [];
  for (const claimType of payload.complianceClaims || []) {
    const complianceRecord = await ComplianceClaimRecordV2.findOneAndUpdate(
      { claimId: claim._id, claimType },
      {
        $set: {
          offerId: offer?._id || null,
          verificationStatus: "claimed",
          claimedValue: payload.complianceDetails?.[claimType] || true,
        },
      },
      { upsert: true, new: true }
    );
    complianceRecords.push(complianceRecord);
  }

  const evidenceLinks = [];
  for (const docId of payload.evidenceDocIds || []) {
    const digilockerDoc = await DigiLockerDocument.findOne({
      _id: docId,
      tenantId: actor.tenantId,
    }).lean();
    if (!digilockerDoc) continue;
    const evidenceLink = await ProductEvidenceLinkV2.create({
      tenantId: actor.tenantId,
      claimId: claim._id,
      offerId: offer?._id || null,
      digilockerDocumentId: digilockerDoc._id,
      docType: payload.evidenceDocTypes?.[docId] || "OTHER",
      sha256: digilockerDoc.currentVersion?.file?.checksumSha256 || "",
      sourceUrl: "",
      verificationStatus: "claimed",
    });
    evidenceLinks.push(evidenceLink);
  }

  return { claim, offer, siteLinks, complianceRecords, evidenceLinks };
};

export const listMarketplaceClaims = async ({ actor, page = 1, limit = 20, q = "" }) => {
  const query = { tenantId: actor.tenantId };
  const claims = await SupplierProductClaimV2.find(query)
    .populate("catalogProductId")
    .populate("variantId")
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const filtered = q
    ? claims.filter((claim) =>
        normalizeToken(claim?.catalogProductId?.canonicalName || "").includes(normalizeToken(q))
      )
    : claims;

  const claimIds = filtered.map((claim) => claim._id);
  const [offers, siteLinks, evidenceCounts] = await Promise.all([
    SupplierProductOfferV2.find({ claimId: { $in: claimIds } }).lean(),
    SupplierProductSiteLinkV2.find({ claimId: { $in: claimIds } })
      .populate("siteId", "site_name plant_id country")
      .lean(),
    ProductEvidenceLinkV2.aggregate([
      { $match: { claimId: { $in: claimIds } } },
      { $group: { _id: "$claimId", count: { $sum: 1 } } },
    ]),
  ]);

  const offerByClaim = new Map(offers.map((offer) => [String(offer.claimId), offer]));
  const sitesByClaim = new Map();
  for (const siteLink of siteLinks) {
    const key = String(siteLink.claimId);
    if (!sitesByClaim.has(key)) sitesByClaim.set(key, []);
    sitesByClaim.get(key).push(siteLink);
  }
  const evidenceByClaim = new Map(
    evidenceCounts.map((entry) => [String(entry._id), entry.count])
  );

  const items = filtered.map((claim) => ({
    _id: claim._id,
    claimStatus: claim.claimStatus,
    verificationStatus: claim.verificationStatus,
    supplierRole: claim.supplierRole || [],
    commercialReady: claim.commercialReady,
    catalogProduct: claim.catalogProductId,
    variant: claim.variantId,
    offer: offerByClaim.get(String(claim._id)) || null,
    sites: sitesByClaim.get(String(claim._id)) || [],
    evidenceCount: evidenceByClaim.get(String(claim._id)) || 0,
  }));

  const total = await SupplierProductClaimV2.countDocuments(query);
  return { items, total, page, limit };
};

export const buildLegacyClaimFacade = async ({ actor }) => {
  const claims = await listMarketplaceClaims({ actor, page: 1, limit: 500 });
  return claims.items.map((claim) =>
    mapMarketplaceClaimToLegacyShape({
      ...claim,
      catalogProduct: claim.catalogProduct,
    })
  );
};

export const getCatalogClaimContext = async ({ actor }) => {
  const [sites, evidenceDocs, recentCatalogProducts, apiMasterCandidates] = await Promise.all([
    SupplierSite.find({ user_id: actor.userId })
      .sort({ site_name: 1 })
      .lean(),
    DigiLockerDocument.find({
      tenantId: actor.tenantId,
      ownerUserId: actor.userId,
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    CatalogProduct.find({})
      .sort({ updatedAt: -1 })
      .limit(25)
      .lean(),
    ApiMaster.find({})
      .sort({ updatedAt: -1 })
      .limit(25)
      .lean(),
  ]);

  return {
    supplierSites: sites.map((site) => ({
      _id: site._id,
      site_name: site.site_name,
      plant_id: site.plant_id,
      city: site.city || "",
      country: site.country || "",
    })),
    evidenceDocuments: evidenceDocs.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      docType: doc.docType,
      classification: doc.classification,
      status: doc.status,
      siteId: doc.siteId || null,
      productId: doc.productId || null,
    })),
    recentCatalogProducts: recentCatalogProducts.map(mapCatalogProductToLegacyCandidate),
    apiMasterCandidates: apiMasterCandidates.map((api) => ({
      _id: api._id,
      canonicalName: api.canonicalName,
      casNumbers: api.casNumbers || [],
      synonyms: api.synonyms || [],
    })),
  };
};

export const resetMarketplaceV2Collections = async () => {
  const models = [
    CatalogProduct,
    CatalogProductVariant,
    SupplierProductClaimV2,
    SupplierProductOfferV2,
    SupplierProductSiteLinkV2,
    ComplianceClaimRecordV2,
    ProductEvidenceLinkV2,
    ProductProvenanceEventV2,
    ProductMergeEventV2,
    ProductRefreshRunV2,
    ProductReviewQueueV2,
  ];
  for (const model of models) {
    try {
      await model.deleteMany({});
    } catch (error) {
      if (!(error instanceof mongoose.Error)) throw error;
    }
  }
};

export const attachMarketplaceSummaries = async ({ items = [], actor = {} }) => {
  if (!Array.isArray(items) || !items.length) return [];

  const productIds = items.map((item) => item._id);
  const claims = await SupplierProductClaimV2.find({
    catalogProductId: { $in: productIds },
  }).lean();
  const bundles = await hydrateClaimBundles(claims, actor);

  const bundlesByProduct = new Map();
  for (const bundle of bundles) {
    const key = toIdString(bundle?.claim?.catalogProductId);
    if (!bundlesByProduct.has(key)) bundlesByProduct.set(key, []);
    bundlesByProduct.get(key).push(bundle);
  }

  return items.map((item) => ({
    ...item,
    marketplaceSummary: buildMarketplaceSummary(item, bundlesByProduct.get(toIdString(item._id)) || []),
  }));
};

export const getCatalogProductDetailView = async ({ productId, actor = {} }) => {
  const product = await CatalogProduct.findById(productId).lean();
  if (!product) return null;

  const [variants, claims, productProvenance] = await Promise.all([
    CatalogProductVariant.find({ catalogProductId: product._id }).sort({ updatedAt: -1 }).lean(),
    SupplierProductClaimV2.find({ catalogProductId: product._id }).sort({ updatedAt: -1 }).lean(),
    ProductProvenanceEventV2.find({
      resourceType: "catalog_product",
      resourceId: product._id,
    })
      .sort({ fetchedAtUtc: -1, createdAt: -1 })
      .lean(),
  ]);

  const bundles = await hydrateClaimBundles(claims, actor);
  const supplierCards = bundles.map(buildSupplierCard);
  const complianceSummary = buildComplianceSummary(
    bundles.flatMap((bundle) => bundle?.compliance || [])
  );
  const sourceBreakdown = buildSourceBreakdown(product?.sourceSummary || [], productProvenance);

  return {
    product: {
      ...product,
      marketplaceSummary: buildMarketplaceSummary(product, bundles),
    },
    variants,
    supplierCards,
    siteCards: uniqStrings(
      bundles
        .flatMap((bundle) => bundle.sites || [])
        .map((site) => JSON.stringify(site))
    ).map((value) => JSON.parse(value)),
    complianceSummary,
    provenance: {
      sourceSummary: product?.sourceSummary || [],
      productEvents: productProvenance,
      sourceBreakdown,
    },
    notes: [
      "Compliance badges indicate claim visibility and evidence-backed verification metadata; they do not replace formal qualification review.",
      "USP and Ph. Eur. style specification references are stored as claims or evidence-backed references unless licensed validation data is available.",
    ],
  };
};
