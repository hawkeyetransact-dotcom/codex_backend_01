import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import {
  createDocument,
  listDocuments,
  saveRedactionDraft,
  generateRedactionView,
  listDocumentViews,
  createSharePolicy,
  getAuditLog,
} from "../controllers/documentDisclosureController.js";

const router = express.Router();

router.post("/documents", authenticate, createDocument);
router.get("/documents", authenticate, listDocuments);
router.post("/documents/:id/redaction/draft", authenticate, saveRedactionDraft);
router.post("/documents/:id/redaction/generate", authenticate, generateRedactionView);
router.get("/documents/:id/views", authenticate, listDocumentViews);
router.post("/documentViews/:id/sharePolicies", authenticate, createSharePolicy);
router.get("/documentViews/:id/auditLog", authenticate, getAuditLog);

export default router;
