import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { createAssessmentType, getAssessmentType, listAssessmentTypes } from "../controllers/assessmentTypeController.js";

const router = express.Router();

router.get("/", authenticate, permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"), listAssessmentTypes);
router.post("/", authenticate, permit("tenant_admin", "admin", "superadmin"), createAssessmentType);
router.get("/:id", authenticate, permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"), getAssessmentType);

export default router;
