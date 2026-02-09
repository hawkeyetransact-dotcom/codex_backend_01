import express from "express";
import {
  retrieve,
  chat,
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
} from "../controllers/askHawkController.js";
import { authorizeAskHawk } from "../middlewares/authorizeAskHawk.js";

const router = express.Router();

router.post("/askhawk/retrieve", authorizeAskHawk, retrieve);
router.post("/askhawk/chat", authorizeAskHawk, chat);

router.get("/askhawk/tools/getAuditSummary", authorizeAskHawk, tool_getAuditSummary);
router.get("/askhawk/tools/listAuditRequests", authorizeAskHawk, tool_listAuditRequests);
router.get("/askhawk/tools/listOpenCapas", authorizeAskHawk, tool_listOpenCapas);
router.get("/askhawk/tools/getQuestionnaireStatus", authorizeAskHawk, tool_getQuestionnaireStatus);
router.get("/askhawk/tools/getEvidenceList", authorizeAskHawk, tool_getEvidenceList);
router.get("/askhawk/tools/getQuestionnaireProgress", authorizeAskHawk, tool_getQuestionnaireProgress);
router.get("/askhawk/tools/getTimelineMilestones", authorizeAskHawk, tool_getTimelineMilestones);
router.get("/askhawk/telemetry", authorizeAskHawk, telemetry);
router.get("/askhawk/unanswered", authorizeAskHawk, listUnanswered);
router.post("/askhawk/unanswered/convert", authorizeAskHawk, convertUnansweredToKb);
router.get("/askhawk/kb/stats", authorizeAskHawk, kbStats);
router.post("/askhawk/kb/sync", authorizeAskHawk, syncCodeKb);

export default router;
