import XLSX from "xlsx";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { supplierProductValidator } from "../validators/supplierProductValidator.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";

// Helper: Find supplier site by plant_id for current user
const getSupplierSiteByPlantId = async (userId, plant_id) => {
  return await SupplierSite.findOne({ user_id: userId, plant_id });
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

      try {
        // Check if product exists by casNumber in supplier-master-products
        let product = await SupplierMasterProducts.findOne({ casNumber });
        let isProductNew = false;
        if (product) {
          // Update existing product
          product = await SupplierMasterProducts.findOneAndUpdate(
            { casNumber },
            { ...productData },
            { new: true }
          );
          // results.push({ index: i, message: "Product updated in master records" });
        } else {
          // Create new product
          product = new SupplierMasterProducts({ casNumber, ...productData });
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
        await ProductSiteMappings.findOneAndUpdate(
          { user_id: req.user._id, site_id: site._id, product_id: product._id },
          { user_id: req.user._id, site_id: site._id, product_id: product._id },
          { upsert: true }
        );
      } catch (err) {
        errors.push({ index: i, message: err.message });
      }
    }

    res.status(200).json({ success: results, errors });
  } catch (error) {
    res.status(500).json({ error: "Error processing the file" });
  }
};

export const addProduct = async (req, res) => {
  const { casNumber, ...productData } = req.body;
  try {
    // Check if product exists in master records
    let product = await SupplierMasterProducts.findOne({ casNumber });
    if (product) {
      product = await SupplierMasterProducts.findOneAndUpdate(
        { casNumber },
        { ...productData },
        { new: true }
      );
    } else {
      product = new SupplierMasterProducts({ casNumber, ...productData });
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
    await ProductSiteMappings.findOneAndUpdate(
      { user_id: req.user._id, site_id: site._id, product_id: product._id },
      { user_id: req.user._id, site_id: site._id, product_id: product._id },
      { upsert: true }
    );

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
    product = await SupplierMasterProducts.findOneAndUpdate(
      { _id: mapping.product_id },
      { ...productData },
      { new: true }
    );

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

export const getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const mapping = await ProductSiteMappings.findOne({
      _id: id,
    })
      .populate("site_id")
      .populate("product_id")
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
