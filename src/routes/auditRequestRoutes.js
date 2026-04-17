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
  updateSupplierDecision,
  getMyAudits,
  archiveAuditRequest,
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
router.get("/supplier", authenticate, permit("supplier", "supplierUser"), getAuditRequestsBySupplier);


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
router.post("/:id/supplier-decision", authenticate, permit("supplier", "supplierUser"), updateSupplierDecision);
// Phase 0: Supplier validates/disputes deficiency findings before CAPA
router.post("/:id/deficiency-validation", authenticate, permit("supplier", "supplierUser"), async (req, res) => {
  try {
    const { AuditRequestMaster } = await import("../models/auditRequestsMasterModel.js");
    const audit = await AuditRequestMaster.findById(req.params.id);
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    const { decision, disputeReason, disputeItems } = req.body;
    if (!["ACCEPTED", "PARTIALLY_ACCEPTED", "DISPUTED"].includes(decision)) {
      return res.status(400).json({ error: "decision must be ACCEPTED, PARTIALLY_ACCEPTED, or DISPUTED" });
    }

    audit.deficiencyValidation = decision;
    audit.deficiencyValidationAt = new Date();
    audit.deficiencyValidationBy = req.user._id;
    if (decision === "DISPUTED" || decision === "PARTIALLY_ACCEPTED") {
      audit.deficiencyDisputeReason = disputeReason || null;
      audit.deficiencyDisputeItems = disputeItems || [];
    }
    await audit.save();
    return res.json({ success: true, data: audit });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
router.post("/:id/archive", authenticate, archiveAuditRequest);

export default router;
