import express from "express";
import {
  refreshFdaData,
  getFdaDashboard,
  rebuildSnapshotOnly,
  listFdaInspections,
  listFdaCitations,
  listFdaForms483,
} from "../controllers/fdaController.js";

const router = express.Router();

router.post("/fda/update", refreshFdaData);
router.get("/fda/dashboard", getFdaDashboard);
router.post("/fda/rebuild-snapshot", rebuildSnapshotOnly);
router.get("/fda/inspections", listFdaInspections);
router.get("/fda/citations", listFdaCitations);
router.get("/fda/forms483", listFdaForms483);

export default router;
