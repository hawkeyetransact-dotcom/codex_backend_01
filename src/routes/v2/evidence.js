import express from "express";
import { authenticate, requireTenantActive } from "../../middlewares/authMiddleware.js";
import { permit } from "../../middlewares/roleMiddleware.js";
import {
  assessmentEvidenceUploadMiddleware,
  uploadAssessmentEvidence,
  listAssessmentEvidence,
  issueAssessmentEvidenceViewToken,
  streamAssessmentEvidence,
} from "../../controllers/v2/assessmentEvidenceController.js";

const router = express.Router();

router.post(
  "/evidence/upload",
  authenticate,
  requireTenantActive,
  permit("supplier", "supplierUser", "auditor", "admin", "tenant_admin", "superadmin"),
  assessmentEvidenceUploadMiddleware,
  uploadAssessmentEvidence
);
router.get(
  "/assessments/:assessmentId/evidence",
  authenticate,
  requireTenantActive,
  listAssessmentEvidence
);
router.post(
  "/assessments/:assessmentId/evidence/:evidenceId/view-token",
  authenticate,
  requireTenantActive,
  issueAssessmentEvidenceViewToken
);
router.get(
  "/assessments/:assessmentId/evidence/:evidenceId/stream",
  authenticate,
  streamAssessmentEvidence
);

export default router;
