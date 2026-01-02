import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { uploadFile} from "../controllers/commonController.js";
import { validate } from "../middlewares/validate.js";
import { permit } from "../middlewares/roleMiddleware.js";

const router = express.Router();

router.post(
    "/upload-file", 
    authenticate,
    uploadFile
);

export default router;
