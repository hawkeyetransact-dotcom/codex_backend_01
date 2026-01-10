import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { getQuestionnairePreviewByTemplateId, getQuestionsByTemplateId } from "../controllers/questionaireController.js";


const router = express.Router();

router.get("/questions/:id", authenticate, getQuestionsByTemplateId);
router.get("/preview/:id", authenticate, getQuestionnairePreviewByTemplateId);




export default router;
