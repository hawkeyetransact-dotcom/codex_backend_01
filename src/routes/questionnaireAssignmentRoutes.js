import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  bulkAssignSections,
  listDepartmentAssignments,
  submitAssignmentsToSpoc,
  upsertDepartmentAssignments,
} from "../controllers/questionnaireAssignmentController.js";

const router = express.Router();

router.get(
  "/audits/:auditId/department-assignments",
  authenticate,
  permit("supplier", "supplierUser"),
  listDepartmentAssignments
);

router.post(
  "/audits/:auditId/department-assignments",
  authenticate,
  permit("supplier"),
  upsertDepartmentAssignments
);

router.post(
  "/audits/:auditId/department-assignments/submit",
  authenticate,
  permit("supplier", "supplierUser"),
  submitAssignmentsToSpoc
);

// G4: Supplier admin bulk-assigns categories to multiple teammates in one call.
router.post(
  "/audits/:auditId/department-assignments/bulk",
  authenticate,
  permit("supplier"),
  bulkAssignSections
);

export default router;
