import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import {
  listTableVariants,
  createTableVariant,
  updateTableVariant,
  deleteTableVariant,
} from "../controllers/tableVariantsController.js";

const router = express.Router();

router.use(authenticate);

router.get("/", listTableVariants);
router.post("/", createTableVariant);
router.put("/:id", updateTableVariant);
router.delete("/:id", deleteTableVariant);

export default router;
