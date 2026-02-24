import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { prefillArtifact } from "../controllers/aiPrefillController.js";

const router = express.Router();

router.post(
  "/artifact",
  authenticate,
  permit("buyer", "auditor", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  prefillArtifact
);

export default router;
