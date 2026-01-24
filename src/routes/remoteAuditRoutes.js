import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  createRemoteSession,
  listRemoteSessions,
  updateRemoteSession,
} from "../controllers/remoteAuditController.js";

const router = express.Router();

const roles = ["auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"];

router.get("/audits/:auditId/remote-sessions", authenticate, permit(...roles), listRemoteSessions);
router.post("/audits/:auditId/remote-sessions", authenticate, permit("auditor", "tenant_admin", "admin", "superadmin"), createRemoteSession);
router.patch(
  "/audits/:auditId/remote-sessions/:sessionId",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  updateRemoteSession
);

export default router;
