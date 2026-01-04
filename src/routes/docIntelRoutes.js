import express from "express";
import { ingestEvidence, ingestUploadMiddleware, saqCoverage } from "../controllers/docIntelController.js";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/evidence/ingest", authenticate, requireTenantActive, ingestUploadMiddleware, ingestEvidence);
router.post("/saq/coverage", authenticate, requireTenantActive, saqCoverage);

export default router;
