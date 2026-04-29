/**
 * G9: AuditProgram CRUD — annual GMP audit schedule with scope coverage.
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  AuditProgram,
  AUDIT_PROGRAM_GMP_SCOPE_AREAS,
} from "../models/auditProgramModel.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const MANAGE_ROLES = ["buyer", "tenant_admin", "admin", "superadmin"];

// GET /api/audit-programs?year=2026
router.get("/", async (req, res) => {
  try {
    const filter = { tenantOrgId: String(req.tenantId) };
    if (req.query.year) filter.year = Number(req.query.year);
    const programs = await AuditProgram.find(filter).sort({ year: -1 }).lean();
    return res.json({ data: programs, gmpScopeAreas: AUDIT_PROGRAM_GMP_SCOPE_AREAS });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/audit-programs/:id
router.get("/:id", async (req, res) => {
  try {
    const program = await AuditProgram.findOne({ _id: req.params.id, tenantOrgId: String(req.tenantId) }).lean();
    if (!program) return res.status(404).json({ error: "Not found" });
    return res.json({ data: program, gmpScopeAreas: AUDIT_PROGRAM_GMP_SCOPE_AREAS });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/audit-programs
// Body: { year, title?, plannedAudits?: [...] }
router.post("/", permit(...MANAGE_ROLES), async (req, res) => {
  try {
    const { year, title = "", plannedAudits = [] } = req.body || {};
    if (!year) return res.status(400).json({ error: "year is required" });
    const existing = await AuditProgram.findOne({ tenantOrgId: String(req.tenantId), year });
    if (existing) {
      return res.status(409).json({ error: `An audit program already exists for ${year}`, existing });
    }
    const program = await AuditProgram.create({
      tenantOrgId: String(req.tenantId),
      year,
      title,
      ownerUserId: req.user._id,
      plannedAudits,
      scopeCoverage: AUDIT_PROGRAM_GMP_SCOPE_AREAS.map((area) => ({
        area, plannedCount: plannedAudits.filter((p) => (p.targetScopeAreas || []).includes(area)).length,
      })),
      status: "DRAFT",
    });
    return res.status(201).json({ data: program });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/audit-programs/:id
router.put("/:id", permit(...MANAGE_ROLES), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.tenantOrgId; delete updates._id;
    const program = await AuditProgram.findOneAndUpdate(
      { _id: req.params.id, tenantOrgId: String(req.tenantId) },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!program) return res.status(404).json({ error: "Not found" });
    return res.json({ data: program });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/audit-programs/:id/approve
router.post("/:id/approve", permit(...MANAGE_ROLES), async (req, res) => {
  try {
    const program = await AuditProgram.findOneAndUpdate(
      { _id: req.params.id, tenantOrgId: String(req.tenantId), status: "DRAFT" },
      { $set: { status: "APPROVED", approvedBy: req.user._id, approvedAt: new Date() } },
      { new: true }
    );
    if (!program) return res.status(404).json({ error: "Program not found or not in DRAFT" });
    return res.json({ data: program });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/audit-programs/:id/planned-audits
// Append a planned audit to the schedule.
router.post("/:id/planned-audits", permit(...MANAGE_ROLES), async (req, res) => {
  try {
    const program = await AuditProgram.findOne({ _id: req.params.id, tenantOrgId: String(req.tenantId) });
    if (!program) return res.status(404).json({ error: "Not found" });
    program.plannedAudits.push(req.body);
    // Recompute scope coverage planned counts.
    program.scopeCoverage = AUDIT_PROGRAM_GMP_SCOPE_AREAS.map((area) => {
      const existing = program.scopeCoverage.find((s) => s.area === area) || {};
      const planned = program.plannedAudits.filter((p) => (p.targetScopeAreas || []).includes(area)).length;
      const completed = program.plannedAudits.filter((p) => p.status === "COMPLETED" && (p.targetScopeAreas || []).includes(area)).length;
      return { ...existing, area, plannedCount: planned, completedCount: completed };
    });
    await program.save();
    return res.status(201).json({ data: program });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/audit-programs/:id/coverage-gaps
// Returns scope areas that have NO planned audit yet, or are overdue (lastCoveredAt > 12mo ago).
router.get("/:id/coverage-gaps", async (req, res) => {
  try {
    const program = await AuditProgram.findOne({ _id: req.params.id, tenantOrgId: String(req.tenantId) }).lean();
    if (!program) return res.status(404).json({ error: "Not found" });
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const gaps = (program.scopeCoverage || [])
      .filter((s) => s.plannedCount === 0 || (s.lastCoveredAt && s.lastCoveredAt < oneYearAgo))
      .map((s) => ({
        area: s.area,
        reason: s.plannedCount === 0 ? "NO_PLANNED_AUDIT" : "OVERDUE",
        lastCoveredAt: s.lastCoveredAt,
      }));
    return res.json({ data: gaps });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
