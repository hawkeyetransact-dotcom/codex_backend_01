import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  createMyAvailability,
  deleteMyAvailability,
  listMyCalendar,
} from "../controllers/userCalendarController.js";

const router = express.Router();

const calendarRoles = ["auditor", "supplier", "supplierUser"];

router.get("/calendar/me", authenticate, permit(...calendarRoles), listMyCalendar);
router.post("/calendar/me/availability", authenticate, permit(...calendarRoles), createMyAvailability);
router.delete(
  "/calendar/me/availability/:blockId",
  authenticate,
  permit(...calendarRoles),
  deleteMyAvailability
);

export default router;
