import express from "express";
import { extractContent } from "../controllers/extractController.js";
import docExtractUpload from "../middlewares/docExtractMiddleware.js";

const router = express.Router();

router.post("/", docExtractUpload.single("file"), extractContent);

export default router;
