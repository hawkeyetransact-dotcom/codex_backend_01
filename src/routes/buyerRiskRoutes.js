import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  getBuyerRiskSummary,
  getBuyerRiskDetail,
  listBuyerRiskProfiles,
  createBuyerRiskProfile,
  updateBuyerRiskProfile,
} from "../controllers/riskBuyerController.js";
import { buyerRiskProfileValidator } from "../validators/riskValidators.js";

const router = express.Router();

router.get(
  "/suppliers/risk-summary",
  authenticate,
  permit("buyer", "tenant_admin", "admin", "superadmin"),
  getBuyerRiskSummary
);
router.get(
  "/suppliers/:supplierId/risk",
  authenticate,
  permit("buyer", "tenant_admin", "admin", "superadmin"),
  getBuyerRiskDetail
);

router.get(
  "/risk-profiles",
  authenticate,
  permit("buyer", "tenant_admin", "admin", "superadmin"),
  listBuyerRiskProfiles
);
router.post(
  "/risk-profiles",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  validate(buyerRiskProfileValidator),
  createBuyerRiskProfile
);
router.put(
  "/risk-profiles/:id",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  validate(buyerRiskProfileValidator),
  updateBuyerRiskProfile
);

export default router;
