import mongoose from "mongoose";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const upsertProductSiteMappings = async (req, res) => {
  try {
    const {
      productId,
      siteIds = [],
      apiMasterId,
      manufacturingRole = "API",
      visibility = "private",
    } = req.body || {};

    if ((!productId && !apiMasterId) || !Array.isArray(siteIds) || siteIds.length === 0) {
      return res.status(400).json({ error: "productId or apiMasterId and siteIds are required" });
    }
    if (productId && !isValidObjectId(productId)) {
      return res.status(400).json({ error: "Invalid productId" });
    }
    if (apiMasterId && !isValidObjectId(apiMasterId)) {
      return res.status(400).json({ error: "Invalid apiMasterId" });
    }

    let resolvedProductId = productId || null;
    let product = null;
    if (resolvedProductId) {
      product = await SupplierMasterProducts.findById(resolvedProductId).lean();
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      const ownedMapping = await ProductSiteMappings.findOne({
        product_id: resolvedProductId,
        user_id: req.user._id,
      }).lean();
      if (!ownedMapping) {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else if (apiMasterId && isValidObjectId(apiMasterId)) {
      const existingMapping = await ProductSiteMappings.findOne({
        apiMasterId,
        user_id: req.user._id,
      }).lean();
      if (!existingMapping) {
        return res.status(404).json({ error: "No supplier product found for apiMasterId" });
      }
      resolvedProductId = existingMapping.product_id;
      product = await SupplierMasterProducts.findById(resolvedProductId).lean();
    }

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (apiMasterId && product.apiMasterId && String(product.apiMasterId) !== String(apiMasterId)) {
      return res.status(400).json({ error: "apiMasterId mismatch for product" });
    }

    const validSites = await SupplierSite.find({
      _id: { $in: siteIds.filter((id) => isValidObjectId(id)) },
      user_id: req.user._id,
    }).select("_id");
    if (!validSites.length) {
      return res.status(400).json({ error: "No valid sites found for supplier" });
    }

    const mappingApiMasterId = product.apiMasterId || apiMasterId;
    if (!mappingApiMasterId) {
      return res.status(400).json({ error: "apiMasterId missing for product" });
    }

    const updates = [];
    for (const site of validSites) {
      const mapping = await ProductSiteMappings.findOneAndUpdate(
        { user_id: req.user._id, site_id: site._id, apiMasterId: mappingApiMasterId },
        {
          $set: {
            product_id: resolvedProductId,
            apiMasterId: mappingApiMasterId,
            manufacturingRole,
            visibility,
          },
          $setOnInsert: {
            user_id: req.user._id,
            site_id: site._id,
            verificationStatus: "unverified",
          },
        },
        { upsert: true, new: true }
      );
      updates.push(mapping);
    }

    return res.status(200).json({ success: true, mappings: updates });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to upsert mappings" });
  }
};
