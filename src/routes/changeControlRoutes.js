// src/routes/changeControlRoutes.js

import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { permit } from '../middlewares/roleMiddleware.js';
import { resolveTenant } from '../middlewares/tenantMiddleware.js';
import ChangeControl from '../models/ChangeControlModel.js';

const router = express.Router();
router.use(authenticate, resolveTenant);

const viewRoles = ['buyer', 'auditor', 'admin', 'tenant_admin', 'workflow_manager', 'inspector', 'verifier', 'reviewer'];
const createRoles = [...viewRoles, 'supplier', 'party_admin'];

router.get('/', permit(...viewRoles), async (req, res) => {
  try {
    const { status, changeType } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (changeType) filter.changeType = changeType;
    const records = await ChangeControl.find(filter).sort({ requestDate: -1 }).lean();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', permit(...viewRoles), async (req, res) => {
  try {
    const record = await ChangeControl.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', permit(...createRoles), async (req, res) => {
  try {
    const record = await ChangeControl.create({
      ...req.body,
      tenantId: req.tenantId,
      requestedBy: req.user._id,
      status: 'DRAFT',
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', permit(...viewRoles), async (req, res) => {
  try {
    const record = await ChangeControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/approval', permit('auditor', 'admin', 'tenant_admin', 'reviewer', 'workflow_manager'), async (req, res) => {
  try {
    const { decision, comments, stepOrder } = req.body;
    const record = await ChangeControl.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!record) return res.status(404).json({ error: 'Not found' });
    const step = record.approvalSteps.find((s) => s.stepOrder === stepOrder);
    if (!step) return res.status(400).json({ error: `Step ${stepOrder} not found` });
    step.decision = decision;
    step.decisionDate = new Date();
    step.userId = req.user._id;
    step.comments = comments;
    const allApproved = record.approvalSteps.every((s) => s.decision === 'APPROVED');
    const anyRejected = record.approvalSteps.some((s) => s.decision === 'REJECTED');
    if (anyRejected) record.status = 'REJECTED';
    else if (allApproved) record.status = 'APPROVED';
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Phase 1: Effectiveness verification endpoint
router.post("/:id/verify-effectiveness", authenticate, permit(...EDIT_ROLES), async (req, res) => {
  try {
    const record = await ChangeControl.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Change control not found" });
    if (!["IMPLEMENTATION", "VERIFICATION"].includes(record.status)) {
      return res.status(400).json({ error: `Cannot verify effectiveness from status ${record.status}` });
    }

    const { verificationNotes, effectivenessCheck, effective } = req.body;
    record.verificationDate = new Date();
    record.verifiedBy = req.user._id;
    record.verificationNotes = verificationNotes || "";
    record.effectivenessCheck = effectivenessCheck || "";
    record.status = effective !== false ? "CLOSED" : "IMPLEMENTATION"; // re-open if not effective
    record.closureDate = effective !== false ? new Date() : null;

    await record.save();
    return res.json(record);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
