import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { noteUploadMiddleware, createNote, listNotes } from "../controllers/auditNoteController.js";

const router = express.Router();

router.post("/audits/:auditId/notes", authenticate, permit("auditor"), noteUploadMiddleware, createNote);
router.get("/audits/:auditId/notes", authenticate, permit("auditor"), listNotes);

export default router;
