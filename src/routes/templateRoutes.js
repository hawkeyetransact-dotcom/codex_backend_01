import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { listTemplates, createTemplate, deleteTemplate } from "../controllers/templateController.js";

const router = express.Router();

router.get("/", authenticate, permit("auditor", "admin"), listTemplates);
router.post("/", authenticate, permit("auditor", "admin"), createTemplate);
router.delete("/:templateId", authenticate, permit("auditor", "admin"), deleteTemplate);

export default router;
