import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { supplierUserProfileValidator } from "../validators/supplierUserProfileValidators.js";
import { createSupplierUserProfile, updateSupplierUserProfile } from "../controllers/supplierUserProfileController.js";

const router = express.Router();

// Only users with role "supplierUser" can access these endpoints
router.post("/create", authenticate, permit("supplierUser"), validate(supplierUserProfileValidator), createSupplierUserProfile);
router.put("/update", authenticate, permit("supplierUser"), validate(supplierUserProfileValidator), updateSupplierUserProfile);

export default router;
