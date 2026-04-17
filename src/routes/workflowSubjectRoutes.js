// src/routes/workflowSubjectRoutes.js

import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { permit } from '../middlewares/roleMiddleware.js';
import { resolveTenant } from '../middlewares/tenantMiddleware.js';
import WorkflowSubject from '../models/WorkflowSubjectModel.js';

const router = express.Router();
router.use(authenticate, resolveTenant);

const viewRoles = ['supplier', 'buyer', 'auditor', 'admin', 'tenant_admin',
  'inspector', 'verifier', 'certifier', 'reviewer', 'party_admin', 'workflow_manager'];
const adminRoles = ['admin', 'tenant_admin', 'workflow_manager', 'buyer'];

router.get('/', permit(...viewRoles), async (req, res) => {
  try {
    const { partyId, subjectType, isActive } = req.query;
    const filter = { tenantId: req.tenantId };
    if (partyId) filter.partyId = partyId;
    if (subjectType) filter.subjectType = subjectType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    const subjects = await WorkflowSubject.find(filter).sort({ name: 1 }).lean();
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', permit(...viewRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!subject) return res.status(404).json({ error: 'Not found' });
    res.json(subject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', permit(...adminRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.create({ ...req.body, tenantId: req.tenantId });
    res.status(201).json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', permit(...adminRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!subject) return res.status(404).json({ error: 'Not found' });
    res.json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Phase 3: Chain of Custody — transfer & receive endpoints ────────────────

// Transfer custody (initiate handoff)
router.post('/:id/transfer', permit(...adminRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!subject) return res.status(404).json({ error: 'Not found' });

    const { toCustodian, toCustodianId, toLocation, condition, notes } = req.body;
    if (!toCustodian) return res.status(400).json({ error: 'toCustodian is required' });

    subject.custodyChain.push({
      fromCustodian: subject.currentCustodian,
      fromCustodianId: subject.currentCustodianId,
      toCustodian,
      toCustodianId: toCustodianId || null,
      fromLocation: subject.currentLocation,
      toLocation: toLocation || null,
      transferredAt: new Date(),
      condition: condition || 'GOOD',
      notes,
    });

    subject.cocStatus = 'IN_TRANSIT';
    await subject.save();
    res.json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Receive custody (confirm receipt)
router.post('/:id/receive', permit(...viewRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!subject) return res.status(404).json({ error: 'Not found' });

    const { condition, notes } = req.body;
    const lastTransfer = subject.custodyChain[subject.custodyChain.length - 1];
    if (lastTransfer) {
      lastTransfer.receivedAt = new Date();
      if (condition) lastTransfer.condition = condition;
      if (notes) lastTransfer.notes = (lastTransfer.notes || '') + ` | Received: ${notes}`;
    }

    subject.currentCustodian = lastTransfer?.toCustodian || subject.currentCustodian;
    subject.currentCustodianId = lastTransfer?.toCustodianId || subject.currentCustodianId;
    subject.currentLocation = lastTransfer?.toLocation || subject.currentLocation;
    subject.cocStatus = condition === 'TAMPERED' || condition === 'DAMAGED' ? 'DISPUTED' : 'RECEIVED';
    await subject.save();
    res.json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get full custody chain history
router.get('/:id/chain', permit(...viewRoles), async (req, res) => {
  try {
    const subject = await WorkflowSubject.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .select('name identifier subjectType currentCustodian currentLocation cocStatus custodyChain')
      .lean();
    if (!subject) return res.status(404).json({ error: 'Not found' });
    res.json({ data: subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
