import express from "express";
import { resetDev, seedDev } from "../controllers/devController.js";

const router = express.Router();

router.post("/dev/reset", resetDev);
router.post("/dev/seed", seedDev);
router.post("/dev-seed", seedDev); // alternate path to avoid any auth intercepts

export default router;
