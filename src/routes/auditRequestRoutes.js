import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  getAuditRequestsByBuyer,
  getAuditRequestsByAuditor,
  getAuditRequestsBySupplier,
  getAuditRequestSingleAudit,
  uploadPastAuditData,
  getPastAuditQuestions,
  getAuditProcessingStatus,
  assignAuditors,
  getMyAudits,
} from "../controllers/auditRequestController.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

// Buyer: Audit requests where current user is the creator (create_by_buyer_id)
// Admin/Tenant Admin: scoped by tenantOrgId
router.get("/buyer", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), getAuditRequestsByBuyer);

// Auditor: Audit requests where current user is the auditor (auditor_id)
router.get("/auditor", authenticate, permit("auditor"), getAuditRequestsByAuditor);
router.get("/auditor/my", authenticate, permit("auditor"), getMyAudits);

// Supplier: Audit requests where current user is the supplier (supplier_id)
router.get("/supplier", authenticate, permit("supplier"), getAuditRequestsBySupplier);


router.get(
  "/requestSingleAudit",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getAuditRequestSingleAudit
);

router.post("/upload-pastaudit",authenticate,upload.single("file"),uploadPastAuditData);

router.get("/get-pastaudit", authenticate, permit("auditor", "supplier"), getPastAuditQuestions);

router.get('/upload/status', authenticate, getAuditProcessingStatus);

router.post("/:id/assign-auditors", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), assignAuditors);

export default router;
