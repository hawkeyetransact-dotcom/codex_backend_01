import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  inviteInternalAuditor,
  inviteExternalAuditor,
  acceptAffiliation,
  revokeAffiliation,
  listOrgAuditors,
  searchAuditors,
} from "../controllers/auditorNetworkController.js";

const router = express.Router();

router.post("/org/:orgId/auditors/internal/invite", authenticate, permit("tenant_admin", "admin", "superadmin"), inviteInternalAuditor);
router.post("/org/:orgId/auditors/external/invite", authenticate, permit("tenant_admin", "admin", "superadmin"), inviteExternalAuditor);
router.post("/auditors/affiliations/:id/accept", authenticate, permit("auditor"), acceptAffiliation);
router.post("/org/:orgId/auditors/affiliations/:id/revoke", authenticate, permit("tenant_admin", "admin", "superadmin"), revokeAffiliation);
router.get("/org/:orgId/auditors", authenticate, permit("tenant_admin", "admin", "superadmin"), listOrgAuditors);
router.get("/auditors/search", authenticate, permit("buyer", "auditor", "tenant_admin", "admin", "superadmin"), searchAuditors);

export default router;
