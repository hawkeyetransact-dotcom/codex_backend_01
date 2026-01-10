import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { upsertProductSiteMappings } from "../controllers/productSiteMappingController.js";

const router = express.Router();

router.post("/upsert", authenticate, permit("supplier", "supplierUser"), upsertProductSiteMappings);

export default router;
