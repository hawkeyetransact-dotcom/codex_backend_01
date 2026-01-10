import mongoose from "mongoose";
import { ApiMaster } from "../src/models/apiMasterModel.js";
import { SupplierMasterProducts } from "../src/models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../src/models/productSiteMappingModel.js";
import { normalizeApiName } from "../src/utils/normalization.js";

export const runMigration = async ({ createIndexes = true } = {}) => {
  const products = await SupplierMasterProducts.find({}).lean();
  const productUpdates = [];
  let created = 0;
  let updated = 0;

  for (const product of products) {
    const normalizedKey = normalizeApiName(product.name || "");
    const cas = product.casNumber ? String(product.casNumber).trim() : "";
    let apiMaster = await ApiMaster.findOne({
      $or: [
        normalizedKey ? { normalizedKey } : null,
        cas ? { casNumbers: cas } : null,
      ].filter(Boolean),
    });

    if (!apiMaster) {
      apiMaster = await ApiMaster.create({
        canonicalName: product.name || "Unknown API",
        normalizedKey: normalizedKey || normalizeApiName(product.name || "unknown"),
        casNumbers: cas ? [cas] : [],
        synonyms: [],
        apiTechnology: product.apiTechnology || "",
        description: product.description || "",
        sourceTags: ["SupplierSeed"],
        status: "active",
      });
      created += 1;
    } else {
      let changed = false;
      if (cas && !apiMaster.casNumbers.includes(cas)) {
        apiMaster.casNumbers.push(cas);
        changed = true;
      }
      if (!apiMaster.sourceTags.includes("SupplierSeed")) {
        apiMaster.sourceTags.push("SupplierSeed");
        changed = true;
      }
      if (changed) {
        await apiMaster.save();
      }
      updated += 1;
    }

    productUpdates.push({
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            apiMasterId: apiMaster._id,
            normalizedName: normalizeApiName(product.name || ""),
            origin: product.origin || "supplier_created",
            matchConfidence: product.matchConfidence ?? 1,
            needsReview: product.needsReview ?? false,
            productType: product.productType || "API",
          },
        },
      },
    });
  }

  if (productUpdates.length) {
    await SupplierMasterProducts.bulkWrite(productUpdates);
  }

  const mappings = await ProductSiteMappings.find({}).lean();
  const mappingUpdates = [];
  for (const mapping of mappings) {
    const product = await SupplierMasterProducts.findById(mapping.product_id).select("apiMasterId").lean();
    if (!product?.apiMasterId) continue;
    mappingUpdates.push({
      updateOne: {
        filter: { _id: mapping._id },
        update: { $set: { apiMasterId: product.apiMasterId } },
      },
    });
  }
  if (mappingUpdates.length) {
    await ProductSiteMappings.bulkWrite(mappingUpdates);
  }

  if (createIndexes) {
    try {
      await SupplierMasterProducts.collection.dropIndex("casNumber_1");
    } catch (err) {
      if (err?.codeName !== "IndexNotFound") {
        console.warn("Skipping casNumber index drop:", err.message);
      }
    }
    await ApiMaster.collection.createIndex({ normalizedKey: 1 }, { unique: true });
    await SupplierMasterProducts.collection.createIndex({ casNumber: 1 });
    await SupplierMasterProducts.collection.createIndex({ apiMasterId: 1 });
    await SupplierMasterProducts.collection.createIndex({ normalizedName: 1, plant_id: 1 });
    await ProductSiteMappings.collection.createIndex(
      { user_id: 1, site_id: 1, apiMasterId: 1 },
      { unique: true, sparse: true }
    );
  }

  return { apiMastersCreated: created, apiMastersUpdated: updated, productCount: products.length, mappingCount: mappings.length };
};

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is required");
    process.exit(1);
  }

  await mongoose.connect(uri);
  try {
    const result = await runMigration();
    console.log("Migration complete", result);
  } catch (err) {
    console.error("Migration failed", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
