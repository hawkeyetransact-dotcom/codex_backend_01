import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { supplierProductValidator } from "../validators/supplierProductValidator.js";
import {
  addProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getProductList,
  getProductById,
} from "../controllers/supplierProductController.js";

const router = express.Router();

// Bulk upload products via Excel file
router.post("/add-products", authenticate, upload.single("file"), addProducts);

// Add a single product via JSON payload
router.post("/add-product", authenticate, validate(supplierProductValidator), addProduct);

// Update product mapping (update master product details)
router.put("/update-product/:id", authenticate, validate(supplierProductValidator.fork(Object.keys(supplierProductValidator.describe().keys), (schema) => schema.optional())), updateProduct);

// Delete a product mapping
router.delete("/delete-product/:id", authenticate, deleteProduct);

// Get paginated list of products (via mappings)
router.get("/product-list", authenticate, getProductList);

// Get a single product mapping by id
router.get("/product/:id", authenticate, getProductById);

export default router;
