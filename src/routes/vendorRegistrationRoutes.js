import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { getVendorRegistration, saveVendorRegistration } from "../controllers/vendorRegistrationController.js";
import {
  getOnboardingWizardPlaybook,
  patchOnboardingWizardState,
} from "../controllers/onboardingWizardController.js";

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

router.get(
  "/wizard/playbook",
  authenticate,
  permit("supplier", "supplierUser", "buyer", "auditor", "admin", "superadmin", "tenant_admin"),
  getOnboardingWizardPlaybook
);

router.patch(
  "/wizard/state",
  authenticate,
  permit("supplier", "supplierUser", "buyer", "auditor", "admin", "superadmin", "tenant_admin"),
  patchOnboardingWizardState
);

export default router;
