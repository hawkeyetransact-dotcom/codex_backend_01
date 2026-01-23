import express from "express";
import { authenticate, requireTenantActive } from "../../middlewares/authMiddleware.js";
import { permit } from "../../middlewares/roleMiddleware.js";
import { createFinding, listFindings } from "../../controllers/v2/findingController.js";

const router = express.Router();

router.post("/findings", authenticate, requireTenantActive, permit("auditor", "admin", "tenant_admin", "superadmin"), createFinding);
router.get("/findings", authenticate, requireTenantActive, listFindings);

export default router;
