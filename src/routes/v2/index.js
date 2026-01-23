import express from "express";
import assessmentRoutes from "./assessments.js";
import questionnaireRoutes from "./questionnaires.js";
import evidenceRoutes from "./evidence.js";
import findingRoutes from "./findings.js";
import capaRoutes from "./capas.js";
import adminRoutes from "./admin.js";

const router = express.Router();

router.use(assessmentRoutes);
router.use(questionnaireRoutes);
router.use(evidenceRoutes);
router.use(findingRoutes);
router.use(capaRoutes);
router.use(adminRoutes);

export default router;
