import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { getQuestionsByTemplateId } from "../controllers/questionaireController.js";


const router = express.Router();

router.get("/questions/:id", authenticate, getQuestionsByTemplateId);




export default router;
