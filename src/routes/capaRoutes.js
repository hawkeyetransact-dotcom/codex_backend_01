import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireESignature } from "../middlewares/requireESignature.js";
import { requireStepApprover } from "../middlewares/requireStepApprover.js";
import { Capa } from "../models/capaModel.js";
import { addCapaAction, createCapa, getCapa, listCapas, updateCapaStatus, updateCapaLinks } from "../controllers/capaController.js";

const router = express.Router();

const allowedRoles = ["buyer", "auditor", "tenant_admin", "admin", "superadmin"];

router.get("/", authenticate, permit(...allowedRoles), listCapas);
router.get("/:id", authenticate, permit(...allowedRoles), getCapa);
router.post("/", authenticate, permit(...allowedRoles), createCapa);

// Status transitions to APPROVED / CLOSED require Part-11 e-signature + SoD.
// Other transitions (DRAFT → IN_REVIEW etc.) skip the gate.
const conditionalApproverGate = (req, res, next) => {
  const target = (req.body?.status || "").toUpperCase();
  if (target !== "APPROVED" && target !== "CLOSED") return next();
  return requireStepApprover({
    Model: Capa,
    recordType: "capa",
    ownerFields: ["createdBy", "ownerId"],
    // CAPA has no formal step list — synthetic step. Reviewers (auditor / QA admin)
    // approve; submitter (typically the supplier) is blocked by SoD.
    resolveStep: () => ({ stepOrder: "approve", role: null }),
  })(req, res, next);
};
const conditionalESign = (req, res, next) => {
  const target = (req.body?.status || "").toUpperCase();
  if (target === "APPROVED" || target === "CLOSED") {
    return requireESignature({ recordType: "capa", meaning: target })(req, res, next);
  }
  return next();
};
router.patch("/:id/status", authenticate, permit(...allowedRoles), conditionalApproverGate, conditionalESign, updateCapaStatus);
router.patch("/:id/links", authenticate, permit(...allowedRoles), updateCapaLinks);
router.post("/:id/actions", authenticate, permit(...allowedRoles), addCapaAction);

export default router;
