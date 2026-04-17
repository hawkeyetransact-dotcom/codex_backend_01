import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { AuditorQualification } from "../models/AuditorQualificationModel.js";

const router = express.Router();

const VIEWER_ROLES = ["buyer", "auditor", "tenant_admin", "admin", "superadmin"];
const EDITOR_ROLES = ["auditor", "tenant_admin", "admin", "superadmin"];

// List all auditor qualifications (with filters)
router.get("/", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const { qualificationStatus, domain, regulatoryExpertise } = req.query;
    const filter = {};
    if (req.user.tenant_id) filter.tenantId = req.user.tenant_id;
    if (qualificationStatus) filter.qualificationStatus = qualificationStatus;
    if (domain) filter["competencyAreas.domain"] = domain;
    if (regulatoryExpertise) filter.regulatoryExpertise = regulatoryExpertise;

    const records = await AuditorQualification.find(filter).sort({ totalAuditsCompleted: -1 }).lean();
    return res.json({ data: records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get single auditor qualification
router.get("/:auditorUserId", authenticate, permit(...VIEWER_ROLES), async (req, res) => {
  try {
    const record = await AuditorQualification.findOne({ auditorUserId: req.params.auditorUserId }).lean();
    if (!record) return res.status(404).json({ error: "Qualification record not found" });
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create or update qualification
router.post("/", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await AuditorQualification.findOneAndUpdate(
      { auditorUserId: req.body.auditorUserId || req.user._id },
      { ...req.body, tenantId: req.user.tenant_id, createdBy: req.user._id },
      { upsert: true, new: true, runValidators: true }
    );
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Add certification
router.post("/:auditorUserId/certifications", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await AuditorQualification.findOne({ auditorUserId: req.params.auditorUserId });
    if (!record) return res.status(404).json({ error: "Qualification record not found" });
    record.certifications.push(req.body);
    await record.save();
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Add competency area
router.post("/:auditorUserId/competencies", authenticate, permit(...EDITOR_ROLES), async (req, res) => {
  try {
    const record = await AuditorQualification.findOne({ auditorUserId: req.params.auditorUserId });
    if (!record) return res.status(404).json({ error: "Qualification record not found" });
    record.competencyAreas.push(req.body);
    await record.save();
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Qualify / disqualify auditor
router.post("/:auditorUserId/qualify", authenticate, permit("tenant_admin", "admin", "superadmin"), async (req, res) => {
  try {
    const { decision, nextReviewDue } = req.body;
    const record = await AuditorQualification.findOne({ auditorUserId: req.params.auditorUserId });
    if (!record) return res.status(404).json({ error: "Qualification record not found" });

    record.qualificationStatus = decision;
    record.qualifiedAt = new Date();
    record.qualifiedBy = req.user._id;
    if (nextReviewDue) record.nextReviewDue = new Date(nextReviewDue);
    await record.save();
    return res.json({ data: record });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
