import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { getSupplierRisk } from "../controllers/riskSupplierController.js";

const router = express.Router();

router.get(
  "/me/risk",
  authenticate,
  permit("supplier", "supplierUser"),
  getSupplierRisk
);

export default router;
