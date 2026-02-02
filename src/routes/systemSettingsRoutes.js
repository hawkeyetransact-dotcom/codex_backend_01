import express from "express";
import { authenticate, requireAdminScope } from "../middlewares/authMiddleware.js";
import { getLlmSettings, updateLlmSettings } from "../controllers/systemSettingsController.js";

const router = express.Router();

router.use(authenticate, requireAdminScope("PLATFORM"));

router.get("/system-settings/llm", getLlmSettings);
router.put("/system-settings/llm", updateLlmSettings);

export default router;
