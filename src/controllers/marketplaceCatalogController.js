import {
  buildLegacyClaimFacade,
  createSupplierClaim,
  ensureCatalogProduct,
  getCatalogClaimContext as getCatalogClaimContextData,
  getFormSchemaAsset,
  getFormUiAsset,
  getSourceManifestAsset,
  listMarketplaceClaims,
  suggestCatalogMatches,
} from "../services/marketplaceCatalog/productCatalogService.js";
import { CatalogProduct } from "../models/productCatalogV2Models.js";

const actorFromReq = (req) => ({
  tenantId: req.tenantId,
  userId: req.user?._id,
  ownerOrgId: req.user?.ownerOrgId || null,
});

export const getMarketplaceCatalogHealth = async (_req, res) => {
  return res.json({
    ok: true,
    message: "Marketplace catalog v2 ready",
  });
};

export const getMarketplaceFormSchema = async (_req, res) => {
  return res.json({ data: getFormSchemaAsset() });
};

export const getMarketplaceFormUi = async (_req, res) => {
  return res.json({ data: getFormUiAsset() });
};

export const getMarketplaceSourceManifest = async (_req, res) => {
  return res.json({ data: getSourceManifestAsset() });
};

export const listCatalogProducts = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const q = String(req.query.q || "").trim();
    const listingType = String(req.query.listingType || "").trim();
    const verificationStatus = String(req.query.verificationStatus || "").trim();

    const query = {};
    if (listingType) query.listingType = listingType;
    if (verificationStatus) query.verificationStatus = verificationStatus;
    if (q) {
      query.$or = [
        { canonicalName: { $regex: q, $options: "i" } },
        { normalizedName: { $regex: q.toLowerCase(), $options: "i" } },
        { synonyms: { $elemMatch: { $regex: q, $options: "i" } } },
        { "identifiers.cas": q },
        { "identifiers.inn": { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      CatalogProduct.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CatalogProduct.countDocuments(query),
    ]);

    return res.json({ data: { items, total, page, limit } });
  } catch (error) {
    console.error("listCatalogProducts", error);
    return res.status(500).json({ error: "Failed to list catalog products" });
  }
};

export const createCatalogProduct = async (req, res) => {
  try {
    const result = await ensureCatalogProduct(req.body, actorFromReq(req));
    return res.status(result.created ? 201 : 200).json({
      data: result,
      message: result.created ? "Catalog product created" : "Catalog product matched",
    });
  } catch (error) {
    console.error("createCatalogProduct", error);
    return res.status(500).json({ error: error.message || "Failed to create catalog product" });
  }
};

export const previewCatalogMatches = async (req, res) => {
  try {
    const matches = await suggestCatalogMatches(req.body || {});
    return res.json({ data: matches });
  } catch (error) {
    console.error("previewCatalogMatches", error);
    return res.status(500).json({ error: "Failed to preview matches" });
  }
};

export const createCatalogClaim = async (req, res) => {
  try {
    const result = await createSupplierClaim(req.body || {}, actorFromReq(req));
    return res.status(201).json({ data: result, message: "Supplier claim created" });
  } catch (error) {
    console.error("createCatalogClaim", error);
    return res.status(500).json({ error: error.message || "Failed to create supplier claim" });
  }
};

export const getCatalogClaimContext = async (req, res) => {
  try {
    const data = await getCatalogClaimContextData(actorFromReq(req));
    return res.json({ data });
  } catch (error) {
    console.error("getCatalogClaimContext", error);
    return res.status(500).json({ error: "Failed to load claim context" });
  }
};

export const listCatalogClaims = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const q = String(req.query.q || "");
    const data = await listMarketplaceClaims({
      actor: actorFromReq(req),
      page,
      limit,
      q,
    });
    return res.json({ data });
  } catch (error) {
    console.error("listCatalogClaims", error);
    return res.status(500).json({ error: "Failed to list supplier claims" });
  }
};

export const bulkPreviewCatalogRows = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const preview = [];
    for (const row of rows) {
      const matches = await suggestCatalogMatches({
        listingType: row.listingType,
        canonicalName: row.canonicalName || row.name,
        identifiers: row.identifiers || {},
      });
      preview.push({
        input: row,
        matchSuggestion: matches[0] || null,
        action: matches[0] && matches[0].matchScore >= 0.92 ? "claim_existing" : "create_or_review",
      });
    }
    return res.json({ data: preview });
  } catch (error) {
    console.error("bulkPreviewCatalogRows", error);
    return res.status(500).json({ error: "Failed to preview bulk rows" });
  }
};

export const getLegacyFacadeClaims = async (req, res) => {
  try {
    const items = await buildLegacyClaimFacade({ actor: actorFromReq(req) });
    return res.json({ data: items });
  } catch (error) {
    console.error("getLegacyFacadeClaims", error);
    return res.status(500).json({ error: "Failed to build legacy facade" });
  }
};
