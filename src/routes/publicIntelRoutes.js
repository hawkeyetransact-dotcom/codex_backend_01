import express from "express";
import {
  listSuppliers,
  getSupplier,
  listApis,
  getApi,
  listInspections,
  listActions,
  createClaimRequest,
  adminRunSync,
  adminUpload,
  manualUploadMiddleware,
} from "../controllers/publicIntelController.js";
import { authenticate, requireAdminScope } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public listing endpoints (no auth required)
router.get("/public-intel/suppliers", listSuppliers);
router.get("/public-intel/suppliers/:id", getSupplier);
router.get("/public-intel/apis", listApis);
router.get("/public-intel/apis/:id", getApi);
router.get("/public-intel/inspections", listInspections);
router.get("/public-intel/actions", listActions);
router.post("/public-intel/claim-requests", createClaimRequest);

// Admin utilities
router.post("/admin/public-intel/run", authenticate, requireAdminScope(["PLATFORM", "TENANT"]), adminRunSync);
router.post(
  "/admin/public-intel/upload",
  authenticate,
  requireAdminScope(["PLATFORM", "TENANT"]),
  manualUploadMiddleware,
  adminUpload
);

export default router;
