import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireESignature } from "../middlewares/requireESignature.js";
import { addCapaAction, createCapa, getCapa, listCapas, updateCapaStatus, updateCapaLinks } from "../controllers/capaController.js";

const router = express.Router();

const allowedRoles = ["buyer", "auditor", "tenant_admin", "admin", "superadmin"];

router.get("/", authenticate, permit(...allowedRoles), listCapas);
router.get("/:id", authenticate, permit(...allowedRoles), getCapa);
router.post("/", authenticate, permit(...allowedRoles), createCapa);

// Status transitions to APPROVED / CLOSED require Part-11 e-signature.
// The middleware short-circuits if status !== APPROVED|CLOSED so other transitions
// (DRAFT → IN_REVIEW etc.) aren't gated.
const conditionalESign = (req, res, next) => {
  const target = (req.body?.status || "").toUpperCase();
  if (target === "APPROVED" || target === "CLOSED") {
    return requireESignature({ recordType: "capa", meaning: target })(req, res, next);
  }
  return next();
};
router.patch("/:id/status", authenticate, permit(...allowedRoles), conditionalESign, updateCapaStatus);
router.patch("/:id/links", authenticate, permit(...allowedRoles), updateCapaLinks);
router.post("/:id/actions", authenticate, permit(...allowedRoles), addCapaAction);

export default router;
