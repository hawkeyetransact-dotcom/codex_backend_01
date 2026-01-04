import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { getFormLayouts, upsertFormLayout } from "../controllers/formLayoutController.js";

const router = express.Router();

router.get("/", authenticate, permit("auditor", "admin"), getFormLayouts);
router.post("/", authenticate, permit("auditor", "admin"), upsertFormLayout);

export default router;
