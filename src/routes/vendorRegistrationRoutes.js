import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { getVendorRegistration, saveVendorRegistration } from "../controllers/vendorRegistrationController.js";

const router = express.Router();

router.get(
  "/vendor-registration",
  authenticate,
  permit("supplier", "supplierUser", "admin", "superadmin", "tenant_admin"),
  getVendorRegistration
);

router.post(
  "/vendor-registration",
  authenticate,
  permit("supplier", "supplierUser", "admin", "superadmin", "tenant_admin"),
  saveVendorRegistration
);

export default router;
