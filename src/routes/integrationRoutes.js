import express from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  listIntegrationProviders,
  listBuyers,
  createIntegrationConnection,
  listIntegrationConnections,
  getIntegrationConnection,
  updateIntegrationConnection,
  testIntegrationConnection,
  upsertIntegrationMapping,
  getIntegrationMapping,
  activateIntegrationConnection,
  pauseIntegrationConnection,
  runIntegrationNow,
  ingestIntegrationWebhook,
  generateDemoEvents,
  listIntegrationRuns,
  listIntegrationEvents,
  uploadCsvEvents,
  getIntegrationMetrics,
} from "../controllers/integrationController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const viewRoles = ["buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"];
const manageRoles = ["supplier", "supplierUser", "tenant_admin", "admin", "superadmin"];

router.get("/integrations/providers", authenticate, permit(...viewRoles), listIntegrationProviders);
router.get("/integrations/buyers", authenticate, permit(...manageRoles), listBuyers);

router.post("/integrations/connections", authenticate, permit(...manageRoles), createIntegrationConnection);
router.get("/integrations/connections", authenticate, permit(...viewRoles), listIntegrationConnections);
router.get("/integrations/connections/:id", authenticate, permit(...viewRoles), getIntegrationConnection);
router.put("/integrations/connections/:id", authenticate, permit(...manageRoles), updateIntegrationConnection);
router.post("/integrations/connections/:id/test", authenticate, permit(...manageRoles), testIntegrationConnection);
router.post("/integrations/connections/:id/mappings", authenticate, permit(...manageRoles), upsertIntegrationMapping);
router.get("/integrations/connections/:id/mappings", authenticate, permit(...viewRoles), getIntegrationMapping);
router.post("/integrations/connections/:id/activate", authenticate, permit(...manageRoles), activateIntegrationConnection);
router.post("/integrations/connections/:id/pause", authenticate, permit(...manageRoles), pauseIntegrationConnection);
router.post("/integrations/connections/:id/run", authenticate, permit(...manageRoles), runIntegrationNow);
router.post("/integrations/connections/:id/demo/generate", authenticate, permit(...manageRoles), generateDemoEvents);
router.get("/integrations/connections/:id/runs", authenticate, permit(...viewRoles), listIntegrationRuns);
router.post("/integrations/connections/:id/csv", authenticate, permit(...manageRoles), upload.single("file"), uploadCsvEvents);

router.post("/integrations/webhook/:connectionId", ingestIntegrationWebhook);
router.get("/integrations/events", authenticate, permit(...viewRoles), listIntegrationEvents);
router.get("/integrations/metrics", authenticate, permit(...viewRoles), getIntegrationMetrics);

export default router;
