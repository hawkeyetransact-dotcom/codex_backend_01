import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { evidenceUploadMiddleware, uploadEvidence, listEvidence, issueViewToken, streamEvidence, revokeEvidenceToken } from "../controllers/evidenceController.js";

const router = express.Router();

router.post("/audits/:auditId/evidence", authenticate, permit("supplier", "supplierUser"), evidenceUploadMiddleware, uploadEvidence);
router.get("/audits/:auditId/evidence", authenticate, permit("auditor", "buyer", "supplier", "supplierUser"), listEvidence);
router.post("/audits/:auditId/evidence/:evidenceId/view-token", authenticate, permit("auditor"), issueViewToken);
router.get("/evidence/:id/stream", authenticate, streamEvidence);
router.post("/evidence/:id/revoke-token", authenticate, revokeEvidenceToken);

export default router;
