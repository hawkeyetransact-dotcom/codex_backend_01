// backend/src/routes/partyRoutes.js
// Universal party management (generalization of supplier/buyer/auditor profiles).

import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import Party from "../models/PartyModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const viewRoles = ["supplier", "buyer", "auditor", "admin", "tenant_admin",
  "inspector", "verifier", "certifier", "reviewer", "party_admin", "workflow_manager"];
const adminRoles = ["admin", "tenant_admin", "workflow_manager"];

// GET list parties for tenant
router.get("/", permit(...viewRoles), async (req, res) => {
  try {
    const { partyType, isActive } = req.query;
    const filter = { tenantId: req.user.tenantId };
    if (partyType) filter.partyType = partyType;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const parties = await Party.find(filter).sort({ displayName: 1 }).lean();
    res.json(parties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single party
router.get("/:id", permit(...viewRoles), async (req, res) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).lean();
    if (!party) return res.status(404).json({ error: "Not found" });
    res.json(party);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create party
router.post("/", permit(...adminRoles, "buyer"), async (req, res) => {
  try {
    const party = await Party.create({
      ...req.body,
      tenantId: req.user.tenantId,
    });
    res.status(201).json(party);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update party
router.put("/:id", permit(...adminRoles, "buyer"), async (req, res) => {
  try {
    const party = await Party.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!party) return res.status(404).json({ error: "Not found" });
    res.json(party);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE soft-deactivate party
router.delete("/:id", permit(...adminRoles), async (req, res) => {
  try {
    const party = await Party.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { isActive: false },
      { new: true }
    );
    if (!party) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Party deactivated", party });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
