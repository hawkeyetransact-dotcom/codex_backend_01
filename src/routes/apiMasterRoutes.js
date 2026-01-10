import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  getApiMasterStatus,
  listApiMaster,
  listApiMasterLetters,
  refreshApiMaster,
  searchApiMaster,
} from "../controllers/apiMasterController.js";

const router = express.Router();

router.get("/search", authenticate, searchApiMaster);
router.get("/status", authenticate, getApiMasterStatus);
router.get("/list", authenticate, listApiMaster);
router.get("/letters", authenticate, listApiMasterLetters);
router.post("/refresh", authenticate, permit("admin", "superadmin"), refreshApiMaster);

export default router;
