import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  initSchedule,
  getSchedule,
  updateSchedule,
  getSuggestions,
  proposeScheduleSlot,
  holdScheduleSlot,
  acceptScheduleSlot,
  confirmSchedule,
  reschedule,
  getScheduleTimeline,
  postScheduleMessage,
  listAvailability,
  createAvailability,
  deleteAvailability,
} from "../controllers/schedulingController.js";

const router = express.Router();
const roles = ["buyer", "auditor", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"];

router.post("/audits/:auditId/schedule/init", authenticate, permit(...roles), initSchedule);
router.get("/audits/:auditId/schedule", authenticate, permit(...roles), getSchedule);
router.put("/audits/:auditId/schedule", authenticate, permit(...roles), updateSchedule);
router.get("/audits/:auditId/schedule/suggestions", authenticate, permit(...roles), getSuggestions);
router.post("/audits/:auditId/schedule/slots/:slotId/propose", authenticate, permit(...roles), proposeScheduleSlot);
router.post("/audits/:auditId/schedule/slots/:slotId/hold", authenticate, permit(...roles), holdScheduleSlot);
router.post("/audits/:auditId/schedule/slots/:slotId/accept", authenticate, permit(...roles), acceptScheduleSlot);
router.post("/audits/:auditId/schedule/confirm", authenticate, permit(...roles), confirmSchedule);
router.post("/audits/:auditId/schedule/reschedule", authenticate, permit(...roles), reschedule);
router.get("/audits/:auditId/schedule/timeline", authenticate, permit(...roles), getScheduleTimeline);
router.post("/audits/:auditId/schedule/messages", authenticate, permit(...roles), postScheduleMessage);
router.get("/audits/:auditId/schedule/availability", authenticate, permit(...roles), listAvailability);
router.post("/audits/:auditId/schedule/availability", authenticate, permit(...roles), createAvailability);
router.delete("/audits/:auditId/schedule/availability/:blockId", authenticate, permit(...roles), deleteAvailability);

export default router;
