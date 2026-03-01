import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { createProfile, updateProfile, getProfile, getSupplierUsers } from "../controllers/supplierProfileController.js";
import { autoFillProfileFromUpload, profileImportUpload } from "../controllers/profileImportController.js";
import { validate } from "../middlewares/validate.js";
import { supplierProfileValidator } from "../validators/supplierProfileValidators.js";
import { permit } from "../middlewares/roleMiddleware.js";


const router = express.Router();

router.post("/supplier/create", authenticate, validate(supplierProfileValidator), createProfile);
router.put("/supplier/update", authenticate, validate(supplierProfileValidator), updateProfile);
router.get("/", authenticate, getProfile);
router.get("/supplier/users", authenticate, permit("supplier"), getSupplierUsers);
router.post(
  "/auto-fill",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "tenant_admin", "admin", "superadmin"),
  profileImportUpload,
  autoFillProfileFromUpload
);

export default router;
