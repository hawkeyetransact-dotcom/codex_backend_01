import express from "express";
import {
  retrieve,
  chat,
  ingest,
  askHawkIngestUpload,
  tool_getAuditSummary,
  tool_listAuditRequests,
  tool_listOpenCapas,
  tool_getQuestionnaireStatus,
  tool_getEvidenceList,
  telemetry,
  tool_getQuestionnaireProgress,
  tool_getTimelineMilestones,
  listUnanswered,
  convertUnansweredToKb,
  kbStats,
  syncCodeKb,
  runQualityEval,
  listQualityEvals,
} from "../controllers/askHawkController.js";
import { authorizeAskHawk } from "../middlewares/authorizeAskHawk.js";
import { authenticate, requireTenantActiveOrPlatformAdmin } from "../middlewares/authMiddleware.js";
import { requireAskHawkEnabled } from "../middlewares/askHawkEnabledMiddleware.js";

const router = express.Router();

router.use(requireAskHawkEnabled);
router.use(authenticate, requireTenantActiveOrPlatformAdmin, authorizeAskHawk);

router.post("/askhawk/retrieve", retrieve);
router.post("/askhawk/chat", chat);
router.post("/askhawk/ingest", askHawkIngestUpload, ingest);

router.get("/askhawk/tools/getAuditSummary", tool_getAuditSummary);
router.get("/askhawk/tools/listAuditRequests", tool_listAuditRequests);
router.get("/askhawk/tools/listOpenCapas", tool_listOpenCapas);
router.get("/askhawk/tools/getQuestionnaireStatus", tool_getQuestionnaireStatus);
router.get("/askhawk/tools/getEvidenceList", tool_getEvidenceList);
router.get("/askhawk/tools/getQuestionnaireProgress", tool_getQuestionnaireProgress);
router.get("/askhawk/tools/getTimelineMilestones", tool_getTimelineMilestones);
router.get("/askhawk/telemetry", telemetry);
router.get("/askhawk/unanswered", listUnanswered);
router.post("/askhawk/unanswered/convert", convertUnansweredToKb);
router.get("/askhawk/kb/stats", kbStats);
router.post("/askhawk/kb/sync", syncCodeKb);
router.post("/askhawk/evals/run", runQualityEval);
router.get("/askhawk/evals", listQualityEvals);

export default router;
