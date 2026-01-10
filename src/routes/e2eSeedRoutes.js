import express from "express";
import { seedSaiLifeSciences } from "../controllers/e2eSeedController.js";

const router = express.Router();

router.post("/e2e/seed-sai", seedSaiLifeSciences);

export default router;
