import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { addSingleSite, addSites, deleteSite, getSiteById, getSiteList, getSiteProducts, updateSite } from "../controllers/supplierSiteController.js";
import upload from "../middlewares/uploadMiddleware.js"; 
import { addSiteValidator } from "../validators/supplierSiteValidator.js";
import { validate } from "../middlewares/validate.js";

import multer from "multer";
import { uploadFileToBucket } from "../utils/s3Upload.js";


const router = express.Router();

router.post("/add-sites", authenticate, upload.single("file"), addSites);
router.post("/add-site", authenticate, validate(addSiteValidator), addSingleSite);
router.delete("/delete-site/:id", authenticate, deleteSite);
router.get("/site-list", authenticate, getSiteList);
router.put("/update-site/:id", authenticate, validate(addSiteValidator.fork(Object.keys(addSiteValidator.describe().keys), (schema) => schema.optional())), updateSite);
router.get("/site/:id", authenticate, getSiteById);
router.get("/site/:id/products", authenticate, getSiteProducts);

// sample code s3 upload

const upload2 = multer();
router.post("/upload", upload2.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file provided" });
      }
      const fileUrl = await uploadFileToBucket(file.buffer, file.originalname, file.mimetype);
      res.status(200).json({ fileUrl });
    } catch (error) {
      res.status(500).json({ message: "Error uploading file", error: error.message });
    }
  });

export default router;
