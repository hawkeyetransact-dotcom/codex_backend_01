import XLSX from "xlsx";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { supplierProductValidator } from "../validators/supplierProductValidator.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { User } from "../models/userModel.js";
import { ApiMaster } from "../models/apiMasterModel.js";
import { normalizeApiName } from "../utils/normalization.js";

// Helper: Find supplier site by plant_id for current user
const getSupplierSiteByPlantId = async (userId, plant_id) => {
  return await SupplierSite.findOne({ user_id: userId, plant_id });
};

const normalizeCas = (value) => {
  if (!value) return "";
  return String(value).trim();
};

const ensureApiMaster = async ({ name, casNumber, apiTechnology, description, sourceTag = "SupplierSeed" }) => {
  const normalizedKey = normalizeApiName(name || "");
  const cas = normalizeCas(casNumber);
  const exactMatch = await ApiMaster.findOne({
    $or: [
      normalizedKey ? { normalizedKey } : null,
      cas ? { casNumbers: cas } : null,
    ].filter(Boolean),
  });

  if (exactMatch) {
    let updated = false;
    if (cas && !exactMatch.casNumbers.includes(cas)) {
      exactMatch.casNumbers.push(cas);
      updated = true;
    }
    if (sourceTag && !exactMatch.sourceTags.includes(sourceTag)) {
      exactMatch.sourceTags.push(sourceTag);
      updated = true;
    }
    if (apiTechnology && !exactMatch.apiTechnology) {
      exactMatch.apiTechnology = apiTechnology;
      updated = true;
    }
    if (description && !exactMatch.description) {
      exactMatch.description = description;
      updated = true;
    }
    if (updated) await exactMatch.save();
    return { apiMaster: exactMatch, matchConfidence: 1, needsReview: false };
  }

  const potentialMatch = normalizedKey
    ? await ApiMaster.findOne({ normalizedKey: { $regex: normalizedKey, $options: "i" } })
    : null;

  const apiMaster = await ApiMaster.create({
    canonicalName: name || "Unknown API",
    normalizedKey: normalizedKey || normalizeApiName(name || "unknown"),
    casNumbers: cas ? [cas] : [],
    synonyms: [],
    apiTechnology: apiTechnology || "",
    description: description || "",
    sourceTags: sourceTag ? [sourceTag] : [],
    status: "active",
  });

  return {
    apiMaster,
    matchConfidence: potentialMatch ? 0.6 : 0.3,
    needsReview: Boolean(potentialMatch),
  };
};

const resolveApiMasterForCreate = async ({ chooseMode, apiMasterId, name, casNumber, apiTechnology, description }) => {
  if (chooseMode === "select_master") {
    const apiMaster = await ApiMaster.findById(apiMasterId);
    if (!apiMaster) {
      const err = new Error("ApiMaster not found");
      err.status = 400;
      throw err;
    }
    return { apiMaster, matchConfidence: 1, needsReview: false };
  }
  return ensureApiMaster({ name, casNumber, apiTechnology, description });
};

const upsertMapping = async ({
  userId,
  siteId,
  productId,
  apiMasterId,
  manufacturingRole = "API",
  visibility = "private",
  verificationStatus = "unverified",
  regulatoryRefs = {},
}) => {
  return ProductSiteMappings.findOneAndUpdate(
    { user_id: userId, site_id: siteId, apiMasterId },
    {
      $set: {
        product_id: productId,
        apiMasterId,
        manufacturingRole,
        visibility,
        verificationStatus,
        regulatoryRefs: {
          dmf: regulatoryRefs.dmf || [],
          cep: regulatoryRefs.cep || [],
          whoPq: regulatoryRefs.whoPq || [],
        },
      },
      $setOnInsert: {
        user_id: userId,
        site_id: siteId,
      },
    },
    { upsert: true, new: true }
  );
};

export const addProducts = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let errors = [];
    let results = [];

    for (let i = 0; i < jsonData.length; i++) {
      const { error } = supplierProductValidator.validate(jsonData[i]);
      if (error) {
        errors.push({ index: i, message: error.details[0].message });
        continue;
      }

      const { casNumber, ...productData } = jsonData[i];
      const plantId = productData.plant_id;
      const normalizedName = normalizeApiName(productData.name || "");

      try {
        const { apiMaster, matchConfidence, needsReview } = await ensureApiMaster({
          name: productData.name,
          casNumber,
          apiTechnology: productData.apiTechnology,
          description: productData.description,
        });
        // Check if product exists by casNumber in supplier-master-products
        const productFilter = { casNumber, plant_id: plantId };
        let product = await SupplierMasterProducts.findOne(productFilter);
        let isProductNew = false;
        if (product) {
          // Update existing product
          product = await SupplierMasterProducts.findOneAndUpdate(
            productFilter,
            {
              ...productData,
              apiMasterId: apiMaster._id,
              normalizedName,
              origin: "supplier_created",
              matchConfidence,
              needsReview,
            },
            { new: true }
          );
          // results.push({ index: i, message: "Product updated in master records" });
        } else {
          // Create new product
          product = new SupplierMasterProducts({
            casNumber,
            ...productData,
            apiMasterId: apiMaster._id,
            normalizedName,
            origin: "supplier_created",
            matchConfidence,
            needsReview,
          });
          await product.save();
          isProductNew = true;
          // results.push({ index: i, message: "Product added to master records" });
        }

        // Find supplier site for the given plant_id
        const site = await getSupplierSiteByPlantId(
          req.user._id,
          productData.plant_id
        );
        if (!site) {
          errors.push({
            index: i,
            message: "Supplier site not found for the given plant_id",
          });
          continue;
        } else {
          results.push({
            index: i,
            message: `Product ${product.casNumber} ${
              isProductNew ? "added" : "Updated"
            } to site ${site.plant_id} successfully`,
          });
        }

        // Create mapping in product-site-mappings
        // Using upsert to avoid duplicate mapping errors
        await upsertMapping({
          userId: req.user._id,
          siteId: site._id,
          productId: product._id,
          apiMasterId: apiMaster._id,
        });
      } catch (err) {
        errors.push({ index: i, message: err.message });
      }
    }

    res.status(200).json({ success: results, errors });
  } catch (error) {
    res.status(500).json({ error: "Error processing the file" });
  }
};

export const createSupplierProduct = async (req, res) => {
  try {
    const {
      name,
      casNumber,
      description,
      apiTechnology,
      dosageForm,
      siteIds = [],
      manufacturingRole = "API",
      visibility = "private",
      chooseMode,
      apiMasterId,
    } = req.body || {};

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!casNumber) return res.status(400).json({ error: "casNumber is required" });
    if (!chooseMode || !["select_master", "create_new"].includes(chooseMode)) {
      return res.status(400).json({ error: "chooseMode must be select_master or create_new" });
    }
    if (chooseMode === "select_master" && !apiMasterId) {
      return res.status(400).json({ error: "apiMasterId is required for select_master" });
    }
    if (!Array.isArray(siteIds) || siteIds.length === 0) {
      return res.status(400).json({ error: "siteIds is required" });
    }

    const normalizedName = normalizeApiName(name || "");
    const { apiMaster, matchConfidence, needsReview } = await resolveApiMasterForCreate({
      chooseMode,
      apiMasterId,
      name,
      casNumber,
      apiTechnology,
      description,
    });

    const validSites = await SupplierSite.find({
      _id: { $in: siteIds },
      user_id: req.user._id,
    }).select("_id plant_id");
    if (!validSites.length) {
      return res.status(400).json({ error: "No valid sites found for supplier" });
    }
    const primaryPlantId = validSites[0]?.plant_id || "";

    let product = await SupplierMasterProducts.findOne({ casNumber, plant_id: primaryPlantId });
    if (product) {
      product = await SupplierMasterProducts.findOneAndUpdate(
        { casNumber, plant_id: primaryPlantId },
        {
          name,
          casNumber,
          description,
          apiTechnology,
          dosageForm,
          plant_id: product.plant_id || primaryPlantId,
          apiMasterId: apiMaster._id,
          normalizedName,
          origin: chooseMode === "select_master" ? "api_master_selected" : "supplier_created",
          matchConfidence,
          needsReview,
        },
        { new: true }
      );
    } else {
      product = await SupplierMasterProducts.create({
        name,
        casNumber,
        description,
        apiTechnology,
        dosageForm,
        plant_id: primaryPlantId,
        apiMasterId: apiMaster._id,
        normalizedName,
        origin: chooseMode === "select_master" ? "api_master_selected" : "supplier_created",
        matchConfidence,
        needsReview,
      });
    }

    const mappings = [];
    for (const site of validSites) {
      const mapping = await upsertMapping({
        userId: req.user._id,
        siteId: site._id,
        productId: product._id,
        apiMasterId: apiMaster._id,
        manufacturingRole,
        visibility,
      });
      mappings.push(mapping);
    }

    if (!product.plant_id && primaryPlantId) {
      product.plant_id = primaryPlantId;
      await product.save();
    }

    return res.status(201).json({
      message: "Supplier product created",
      product,
      apiMaster,
      mappings,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to create product" });
  }
};

export const addProduct = async (req, res) => {
  const { casNumber, ...productData } = req.body;
  try {
    const normalizedName = normalizeApiName(productData.name || "");
    const { apiMaster, matchConfidence, needsReview } = await ensureApiMaster({
      name: productData.name,
      casNumber,
      apiTechnology: productData.apiTechnology,
      description: productData.description,
    });
    // Check if product exists in master records
    let product = await SupplierMasterProducts.findOne({ casNumber, plant_id: productData.plant_id });
    if (product) {
      product = await SupplierMasterProducts.findOneAndUpdate(
        { casNumber, plant_id: productData.plant_id },
        {
          ...productData,
          apiMasterId: apiMaster._id,
          normalizedName,
          origin: "supplier_created",
          matchConfidence,
          needsReview,
        },
        { new: true }
      );
    } else {
      product = new SupplierMasterProducts({
        casNumber,
        ...productData,
        apiMasterId: apiMaster._id,
        normalizedName,
        origin: "supplier_created",
        matchConfidence,
        needsReview,
      });
      await product.save();
    }

    // Find supplier site for the given plant_id
    const site = await getSupplierSiteByPlantId(
      req.user._id,
      productData.plant_id
    );
    if (!site) {
      return res
        .status(400)
        .json({ error: "Supplier site not found for the given plant_id" });
    }

    // Create mapping
    await upsertMapping({
      userId: req.user._id,
      siteId: site._id,
      productId: product._id,
      apiMasterId: apiMaster._id,
    });

    res.status(201).json({ message: "Product added successfully", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProduct = async (req, res) => {
  const { id } = req.params; // mapping id
  const { casNumber, ...productData } = req.body;
  try {
    // Find mapping to get product_id
    const mapping = await ProductSiteMappings.findOne({
      _id: id,
      user_id: req.user._id,
    });
    if (!mapping) {
      return res.status(404).json({ error: "Product mapping not found" });
    }

    // Update the product in master records
    let product = await SupplierMasterProducts.findOne({
      _id: mapping.product_id,
    });
    if (!product) {
      return res
        .status(404)
        .json({ error: "Product not found in master records" });
    }
    const normalizedName = normalizeApiName(productData.name || product.name || "");
    const { apiMaster, matchConfidence, needsReview } = await ensureApiMaster({
      name: productData.name || product.name,
      casNumber: casNumber || product.casNumber,
      apiTechnology: productData.apiTechnology || product.apiTechnology,
      description: productData.description || product.description,
    });
    product = await SupplierMasterProducts.findOneAndUpdate(
      { _id: mapping.product_id },
      {
        ...productData,
        apiMasterId: apiMaster._id,
        normalizedName,
        matchConfidence,
        needsReview,
      },
      { new: true }
    );

    if (mapping.apiMasterId?.toString() !== apiMaster._id.toString()) {
      mapping.apiMasterId = apiMaster._id;
      await mapping.save();
    }

    res.status(200).json({ message: "Product updated successfully", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  const { id } = req.params; // mapping id
  try {
    const mapping = await ProductSiteMappings.findOne({
      _id: id,
      user_id: req.user._id,
    });
    if (!mapping) {
      return res.status(404).json({ error: "Product mapping not found" });
    }
    await mapping.deleteOne();
    res.status(200).json({ message: "Product mapping deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProductList = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const mappings = await ProductSiteMappings.find({ user_id: req.user._id })
      .populate("site_id")
      .populate("product_id")
      .populate("apiMasterId")
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .exec();
    const count = await ProductSiteMappings.countDocuments({
      user_id: req.user._id,
    });

    res.status(200).json({
      mappings,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalRecords: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const listSupplierProducts = async (req, res) => {
  try {
    const { userId, tenantId, page = 1, limit = 10 } = req.query;
    let userIds = [];
    if (tenantId) {
      const users = await User.find({ tenant_id: tenantId, role: "supplier" }).select("_id");
      userIds = users.map((u) => u._id);
    } else if (userId) {
      userIds = [userId];
    } else {
      userIds = [req.user._id];
    }

    if (req.user?.role !== "admin" && req.user?.role !== "superadmin") {
      if (userIds.some((id) => String(id) !== String(req.user._id))) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const query = { user_id: { $in: userIds } };
    const mappings = await ProductSiteMappings.find(query)
      .populate("site_id")
      .populate("product_id")
      .populate("apiMasterId")
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();
    const count = await ProductSiteMappings.countDocuments(query);
    return res.status(200).json({
      mappings,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalRecords: count,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const mapping = await ProductSiteMappings.findOne({
      _id: id,
    })
      .populate("site_id")
      .populate("product_id")
      .populate("apiMasterId")
      .lean();
    const supplierProfileInfo = await SupplierProfile.findOne({
      user_id: mapping.user_id,
    });
    if (!mapping) {
      return res.status(404).json({ error: "Product mapping not found" });
    }
    mapping.supplierProfileInfo = supplierProfileInfo;
    res.status(200).json(mapping);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
