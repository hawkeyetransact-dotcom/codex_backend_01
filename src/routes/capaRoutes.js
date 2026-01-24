import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { addCapaAction, createCapa, getCapa, listCapas, updateCapaStatus, updateCapaLinks } from "../controllers/capaController.js";

const router = express.Router();

const allowedRoles = ["buyer", "auditor", "tenant_admin", "admin", "superadmin"];

router.get("/", authenticate, permit(...allowedRoles), listCapas);
router.get("/:id", authenticate, permit(...allowedRoles), getCapa);
router.post("/", authenticate, permit(...allowedRoles), createCapa);
router.patch("/:id/status", authenticate, permit(...allowedRoles), updateCapaStatus);
router.patch("/:id/links", authenticate, permit(...allowedRoles), updateCapaLinks);
router.post("/:id/actions", authenticate, permit(...allowedRoles), addCapaAction);

export default router;
