// src/routes/changeControlRoutes.js

import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { permit } from '../middlewares/roleMiddleware.js';
import { resolveTenant } from '../middlewares/tenantMiddleware.js';
import { requireESignature } from '../middlewares/requireESignature.js';
import ChangeControl from '../models/ChangeControlModel.js';
import { notifySupplier } from '../services/governance/notifySupplier.js';
import { applyPersonaScope } from '../middlewares/personaScope.js';
import { recordTransition } from '../services/auditTrailService.js';

const router = express.Router();
router.use(authenticate, resolveTenant);

// Suppliers must also be allowed to LIST/VIEW change-controls assigned to them.
const viewRoles = ['buyer', 'auditor', 'admin', 'tenant_admin', 'workflow_manager', 'inspector', 'verifier', 'reviewer', 'supplier', 'supplierUser'];
const createRoles = [...viewRoles, 'party_admin'];

const supplierUrl = (id) => `/supplier/change-controls/${id}`;

router.get('/', permit(...viewRoles), async (req, res) => {
  try {
    const { status, changeType } = req.query;
    const filter = applyPersonaScope(req, { tenantId: req.tenantId }, { supplierField: 'supplierId' });
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
    const filter = applyPersonaScope(req, { _id: req.params.id, tenantId: req.tenantId }, { supplierField: 'supplierId' });
    const record = await ChangeControl.findOne(filter).lean();
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supplier acknowledgement
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const record = await ChangeControl.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, supplierId: req.user._id },
      { $set: { supplierAcknowledgedAt: new Date(), supplierAcknowledgedBy: req.user._id } },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: 'Not found or not assigned to you' });
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', permit(...createRoles), async (req, res) => {
  try {
    if (req.body?.changeType === 'SUPPLIER' && !req.body?.supplierId) {
      return res.status(400).json({ error: 'supplierId is required for SUPPLIER-type change controls' });
    }
    const record = await ChangeControl.create({
      ...req.body,
      tenantId: req.tenantId,
      requestedBy: req.user._id,
      status: 'DRAFT',
    });

    if (record.supplierId) {
      notifySupplier({
        tenantId: req.tenantId,
        supplierUserId: record.supplierId,
        eventKey: 'CHANGE_CONTROL_OPENED',
        actionUrl: supplierUrl(record._id),
        payload: {
          changeControlId: record._id,
          changeNumber: record.changeNumber,
          changeType: record.changeType,
          triggersRequalification: record.triggersRequalification,
          title: record.title,
        },
      }).catch((e) => console.error('notifySupplier(CHANGE_CONTROL_OPENED) failed:', e?.message));
    }

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

router.post(
  '/:id/approval',
  permit('auditor', 'admin', 'tenant_admin', 'reviewer', 'workflow_manager'),
  requireESignature({ recordType: 'change_control', meaning: 'APPROVED' }),
  async (req, res) => {
  try {
    const { decision, comments, stepOrder, reasonForChange } = req.body;
    const record = await ChangeControl.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!record) return res.status(404).json({ error: 'Not found' });
    const step = record.approvalSteps.find((s) => s.stepOrder === stepOrder);
    if (!step) return res.status(400).json({ error: `Step ${stepOrder} not found` });
    const fromStatus = record.status;
    step.decision = decision;
    step.decisionDate = new Date();
    step.userId = req.user._id;
    step.comments = comments;
    if (req.electronicSignature?._id) step.signatureId = req.electronicSignature._id;
    const allApproved = record.approvalSteps.every((s) => s.decision === 'APPROVED');
    const anyRejected = record.approvalSteps.some((s) => s.decision === 'REJECTED');
    if (anyRejected) record.status = 'REJECTED';
    else if (allApproved) record.status = 'APPROVED';
    await record.save();

    await recordTransition({
      req,
      module: 'change_control',
      entityType: 'change_control',
      entityId: record._id,
      fromStatus,
      toStatus: record.status,
      reasonForChange,
      extraMeta: { stepOrder, decision, comments: comments || null, changeNumber: record.changeNumber },
    });

    if (record.supplierId && (record.status === 'APPROVED' || record.status === 'REJECTED')) {
      notifySupplier({
        tenantId: req.tenantId,
        supplierUserId: record.supplierId,
        eventKey: 'CHANGE_CONTROL_DECISION',
        actionUrl: supplierUrl(record._id),
        payload: {
          changeControlId: record._id,
          changeNumber: record.changeNumber,
          decision: record.status,
          triggersRequalification: record.triggersRequalification,
        },
      }).catch((e) => console.error('notifySupplier(CHANGE_CONTROL_DECISION) failed:', e?.message));
    }

    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Phase 1: Effectiveness verification endpoint
router.post("/:id/verify-effectiveness", permit(...createRoles), async (req, res) => {
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
