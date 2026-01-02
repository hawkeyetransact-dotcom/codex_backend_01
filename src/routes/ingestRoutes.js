import express from "express";
import { ingestTemplate, createTemplate } from "../controllers/ingestController.js";
import multer from 'multer';

// Setup Multer for temp storage
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Route to upload file -> AI Proxy
router.post("/ingest", upload.single('file'), ingestTemplate);

// Route to save finalized template
router.post("/create", createTemplate);

export default router;
