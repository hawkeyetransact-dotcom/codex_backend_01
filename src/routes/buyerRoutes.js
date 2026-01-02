import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { paginationValidator } from "../validators/paginationValidator.js";
import {
  createAuditRequest,
  getAllProducts,
  getAllSuppliers,
  getAllSuppliersProfile,
  getAuditors,
  getProductsBySupplier,
  getSiteProducts,
  getSites,
  getSitesBySupplier,
  getSupplierByID,
  updateAuditRequest,
} from "../controllers/buyerController.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { createAuditRequestValidator, updateAuditRequestValidator } from "../validators/buyerValidator.js";
import { buyerProfileValidator } from "../validators/buyerProfileValidators.js";
import {
  createBuyerProfile,
  updateBuyerProfile,
} from "../controllers/buyerController.js";

const router = express.Router();

router.get(
  "/auditors",
  authenticate,
  permit("buyer"),
  validate(paginationValidator),
  getAuditors
);

router.get(
  "/suppliers",
  authenticate,
  permit("buyer"),
  validate(paginationValidator),
  getAllSuppliers
);

router.get(
  "/suppliers-profile",
  authenticate,
  permit("buyer"),
  validate(paginationValidator),
  getAllSuppliersProfile
);

router.get("/sites", authenticate, permit("buyer"), getSites);

router.get(
  "/site-products/:id",
  authenticate,
  permit("buyer"),
  getSiteProducts
);

router.get("/all-products", authenticate, permit("buyer"), getAllProducts);

router.post(
  "/audit-request",
  authenticate,
  permit("buyer"),
  validate(createAuditRequestValidator),
  createAuditRequest
);

router.post(
  "/profile/create",
  authenticate,
  permit("buyer"),
  validate(buyerProfileValidator),
  createBuyerProfile
);

router.put(
  "/profile/update",
  authenticate,
  permit("buyer"),
  validate(buyerProfileValidator),
  updateBuyerProfile
);

router.get(
  "/products-by-supplier",
  authenticate,
  permit("buyer"),
  validate(paginationValidator),
  getProductsBySupplier
);

router.get(
  "/sites-by-supplier",
  authenticate,
  permit("buyer"),
  validate(paginationValidator),
  getSitesBySupplier
);

router.get(
  "/suppliers/:id",
  authenticate,
  permit("buyer"),
  validate(paginationValidator),
  getSupplierByID
);

router.put(
  "/update-audit-request/:id",
  authenticate,
  permit("auditor", "supplier"), // 👈 Allow both roles
  validate(updateAuditRequestValidator), // 👈 Assuming this validator is correct for your payload
  updateAuditRequest
);

export default router;
