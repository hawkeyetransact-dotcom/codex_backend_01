import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { addSiteValidator } from "../validators/supplierSiteValidator.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import XLSX from "xlsx";

export const addSites = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Read the uploaded Excel file
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let errors = [];
    let results = [];

    for (let i = 0; i < jsonData.length; i++) {
      const { error } = addSiteValidator.validate(jsonData[i]);
      if (error) {
        errors.push({ index: i, message: error.details[0].message });
        continue;
      }

      const { plant_id, ...siteData } = jsonData[i];

      try {
        const existingSite = await SupplierSite.findOne({
          user_id: req.user._id,
          plant_id,
        });

        if (existingSite) {
          await SupplierSite.updateOne(
            { user_id: req.user._id, plant_id },
            { ...siteData }
          );
          results.push({ index: i, message: "Updated successfully" });
        } else {
          const newSite = new SupplierSite({
            ...siteData,
            plant_id,
            user_id: req.user._id,
          });
          await newSite.save();
          results.push({ index: i, message: "Added successfully" });
        }
      } catch (err) {
        errors.push({ index: i, message: err.message });
      }
    }

    res.status(200).json({ success: results, errors });
  } catch (error) {
    res.status(500).json({ error: "Error processing the file" });
  }
};

export const addSingleSite = async (req, res) => {
  const { plant_id, ...siteData } = req.body;

  try {
    const existingSite = await SupplierSite.findOne({
      user_id: req.user._id,
      plant_id,
    });

    if (existingSite) {
      await SupplierSite.updateOne(
        { user_id: req.user._id, plant_id },
        { ...siteData }
      );
      return res.status(200).json({ message: "Site updated successfully" });
    }

    const newSite = new SupplierSite({
      ...siteData,
      plant_id,
      user_id: req.user._id,
    });
    await newSite.save();

    res.status(201).json({ message: "Site added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteSite = async (req, res) => {
  try {
    // Find the site that belongs to the authenticated user
    const site = await SupplierSite.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });
    if (!site)
      return res.status(403).json({ error: "Unauthorized or site not found" });

    // Delete all product mappings associated with this site, but keep master products intact
    await ProductSiteMappings.deleteMany({
      site_id: site._id,
      user_id: req.user._id,
    });

    // Delete the site
    await site.deleteOne();
    res
      .status(200)
      .json({
        message: "Site and associated product mappings deleted successfully",
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSiteList = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const sites = await SupplierSite.find({ user_id: req.user._id })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await SupplierSite.countDocuments({ user_id: req.user._id });

    res
      .status(200)
      .json({ sites, totalPages: Math.ceil(count / limit), currentPage: page, totalRecords: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSite = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    const existingSite = await SupplierSite.findOne({
      _id: id,
      user_id: req.user._id,
    });

    if (!existingSite) {
      return res
        .status(404)
        .json({ error: "Site not found or unauthorized access" });
    }

    // Ensure `plant_id` uniqueness within the same user
    if (updateData.plant_id && updateData.plant_id !== existingSite.plant_id) {
      const siteWithSamePlantID = await SupplierSite.findOne({
        user_id: req.user._id,
        plant_id: updateData.plant_id,
      });

      if (siteWithSamePlantID) {
        return res
          .status(400)
          .json({
            error: "Another site with the same plant_id already exists",
          });
      }
    }

    await SupplierSite.updateOne(
      { _id: id, user_id: req.user._id },
      { $set: updateData }
    );

    res.status(200).json({ message: "Site updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSiteById = async (req, res) => {
  const { id } = req.params;

  try {
    const site = await SupplierSite.findOne({ _id: id, user_id: req.user._id });

    if (!site) {
      return res
        .status(404)
        .json({ error: "Site not found or unauthorized access" });
    }

    res.status(200).json(site);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
