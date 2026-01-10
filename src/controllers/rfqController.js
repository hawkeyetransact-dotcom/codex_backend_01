import mongoose from "mongoose";
import moment from "moment";
import { AuditRFQ } from "../models/auditRfqModel.js";
import { AuditRFQQuote } from "../models/auditRfqQuoteModel.js";
import { AuditRFQThread } from "../models/auditRfqThreadModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { User } from "../models/userModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { getNextSequence } from "../utils/sequenceGenerator.js";

const BUYER_ROLES = ["buyer", "tenant_admin", "admin", "superadmin"];
const AUDITOR_ROLE = "auditor";
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;
const rateBuckets = new Map();

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const trimText = (value, max = 2000) => {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  return text.length > max ? text.slice(0, max) : text;
};

const checkRateLimit = (key) => {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, start: now };
  if (now - bucket.start > RATE_WINDOW_MS) {
    bucket.count = 0;
    bucket.start = now;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= RATE_LIMIT;
};

const buildAuditTrail = (req, action, message, metadata) => ({
  action,
  message,
  actorUserId: req.user?._id,
  actorRole: req.user?.role,
  createdAt: new Date(),
  metadata,
});

const canBuyerAccess = (req, rfq) => {
  if (!rfq || !req.tenantId) return false;
  return BUYER_ROLES.includes(req.user?.role) && String(rfq.tenantId) === String(req.tenantId);
};

const canAuditorAccess = (req, rfq) => {
  if (!rfq || !req.tenantId) return false;
  if (req.user?.role !== AUDITOR_ROLE) return false;
  return (rfq.invitedAuditors || []).some((inv) => String(inv.auditorOrgId) === String(req.tenantId));
};

const assertRfqAccess = (req, rfq) => {
  if (canBuyerAccess(req, rfq) || canAuditorAccess(req, rfq)) return;
  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
};

const sanitizeRfqPayload = (payload = {}) => ({
  title: trimText(payload.title, 180),
  supplierOrgId: isValidObjectId(payload.supplierOrgId) ? payload.supplierOrgId : undefined,
  siteId: isValidObjectId(payload.siteId) ? payload.siteId : undefined,
  productIds: Array.isArray(payload.productIds)
    ? payload.productIds.filter((id) => isValidObjectId(id))
    : [],
  auditType: trimText(payload.auditType, 80),
  auditMode: trimText(payload.auditMode, 80),
  standards: Array.isArray(payload.standards) ? payload.standards.map((s) => trimText(s, 80)).filter(Boolean) : [],
  scopeText: trimText(payload.scopeText, 2000),
  deliverables: Array.isArray(payload.deliverables) ? payload.deliverables.map((d) => trimText(d, 120)).filter(Boolean) : [],
  preferredWindow: {
    startDate: payload.preferredWindow?.startDate ? new Date(payload.preferredWindow.startDate) : undefined,
    endDate: payload.preferredWindow?.endDate ? new Date(payload.preferredWindow.endDate) : undefined,
  },
  location: {
    country: trimText(payload.location?.country, 80),
    state: trimText(payload.location?.state, 80),
    city: trimText(payload.location?.city, 80),
    addressText: trimText(payload.location?.addressText, 200),
  },
  confidentiality: {
    ndaRequired: Boolean(payload.confidentiality?.ndaRequired),
    level: payload.confidentiality?.level || "LOW",
  },
  closingAt: payload.closingAt ? new Date(payload.closingAt) : undefined,
  attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
});

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeLineItems = (items = []) =>
  items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const amount = roundMoney(quantity * unitPrice);
    return {
      label: trimText(item.label, 120),
      quantity,
      unitPrice,
      amount,
    };
  });

const computeTotals = (items = [], tax = 0) => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const taxValue = roundMoney(tax);
  return {
    subtotal,
    tax: taxValue,
    total: roundMoney(subtotal + taxValue),
  };
};

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };
const ensureWorkflowRecord = async (tenantId, auditId, code) => {
  if (!tenantId || !auditId || !code) return null;
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const existing = await WorkflowMilestoneInstance.findOne(filter);
  if (existing) return existing;
  return WorkflowMilestoneInstance.create({ ...filter, status: "NOT_STARTED" });
};
const advanceMilestone = async ({ tenantId, auditId, code, desiredStatus }) => {
  if (!tenantId || !auditId || !code || !desiredStatus) return;
  await ensureWorkflowRecord(tenantId, auditId, code);
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const current = await WorkflowMilestoneInstance.findOne(filter).lean();
  const currentRank = MILESTONE_ORDER[current?.status] ?? 0;
  const desiredRank = MILESTONE_ORDER[desiredStatus] ?? 0;
  if (desiredRank < currentRank) return;
  const update = { status: desiredStatus, updatedAt: new Date() };
  if (desiredStatus === "IN_PROGRESS" && !current?.startedAt) update.startedAt = new Date();
  if (desiredStatus === "COMPLETED") {
    update.completedAt = new Date();
    if (current?.expectedAt) update.isOverdue = current.expectedAt < new Date();
  }
  await WorkflowMilestoneInstance.findOneAndUpdate(filter, update, { new: true, upsert: true });
};
const syncMilestonesFromStatus = async ({ auditId, tenantId, trackStatus, questionnaireStatus, nextAuditOn }) => {
  if (!auditId || !tenantId) return;
  const statusNorm = (trackStatus || "").toLowerCase();
  const qStatus = (questionnaireStatus || "").toLowerCase();
  if (statusNorm.includes("request") || qStatus === "request_received") {
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_COMPLETED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_SENT", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_SENT", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_RECEIVED", desiredStatus: "IN_PROGRESS" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "supplier_draft") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed") || nextAuditOn === "auditor") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_COMPLETED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_RECEIVED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }
  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_COMPLETED", desiredStatus: "COMPLETED" });
  }
};

const pickMapping = async ({ supplierId, siteId, productIds }) => {
  if (!supplierId || !Array.isArray(productIds) || !productIds.length) return null;
  const query = {
    user_id: supplierId,
    product_id: { $in: productIds },
  };
  if (siteId) query.site_id = siteId;
  const mapping = await ProductSiteMappings.findOne(query).lean();
  return mapping || null;
};

const notifyUsers = async ({ tenantId, recipientUserIds, title, message, action, entityId }) => {
  if (!tenantId || !recipientUserIds?.length) return;
  try {
    await NotificationOrchestratorService.emitEvent(
      "rfq.event",
      {
        entityType: "rfq",
        entityId: entityId || null,
        title,
        message,
        recipientStrategy: "explicit",
        recipientUserIds,
        severity: "info",
        action,
      },
      { tenantId }
    );
  } catch (err) {
    console.error("[rfq notify] failed", err.message);
  }
};

export const createRfq = async (req, res) => {
  try {
    if (!BUYER_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant context missing" });
    }
    if (!checkRateLimit(`rfq:create:${req.user?._id}`)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const seq = await getNextSequence(`rfq:${req.tenantId}`);
    const rfqNumber = `RFQ-${String(seq).padStart(6, "0")}`;
    const payload = sanitizeRfqPayload(req.body);

    const rfq = await AuditRFQ.create({
      tenantId: req.tenantId,
      rfqNumber,
      status: "DRAFT",
      ...payload,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
      auditTrail: [buildAuditTrail(req, "CREATED", "RFQ draft created")],
    });

    return res.status(201).json({ success: true, data: rfq });
  } catch (error) {
    console.error("createRfq error", error);
    return res.status(500).json({ error: "Failed to create RFQ" });
  }
};

export const updateRfq = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });

    if (!canBuyerAccess(req, rfq)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!["DRAFT", "IN_QA"].includes(rfq.status)) {
      return res.status(400).json({ error: "RFQ can only be updated in draft" });
    }
    const payload = sanitizeRfqPayload(req.body);
    Object.assign(rfq, payload);
    rfq.updatedBy = req.user?._id;
    rfq.auditTrail.push(buildAuditTrail(req, "UPDATED", "RFQ draft updated"));
    await rfq.save();

    return res.json({ success: true, data: rfq });
  } catch (error) {
    console.error("updateRfq error", error);
    return res.status(500).json({ error: "Failed to update RFQ" });
  }
};

export const publishRfq = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    if (!canBuyerAccess(req, rfq)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!checkRateLimit(`rfq:publish:${req.user?._id}`)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    if (!rfq.title || !rfq.supplierOrgId || !rfq.siteId || !rfq.productIds?.length) {
      return res.status(400).json({ error: "Missing required RFQ details before publish" });
    }
    if (!rfq.closingAt) {
      return res.status(400).json({ error: "closingAt is required before publish" });
    }
    rfq.status = "PUBLISHED";
    rfq.updatedBy = req.user?._id;
    rfq.auditTrail.push(buildAuditTrail(req, "PUBLISHED", "RFQ published"));
    await rfq.save();

    return res.json({ success: true, data: rfq });
  } catch (error) {
    console.error("publishRfq error", error);
    return res.status(500).json({ error: "Failed to publish RFQ" });
  }
};

export const inviteAuditors = async (req, res) => {
  try {
    const { id } = req.params;
    const { auditorOrgIds = [] } = req.body || {};
    const rfq = await AuditRFQ.findById(id);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    if (!canBuyerAccess(req, rfq)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!checkRateLimit(`rfq:invite:${req.user?._id}`)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }
    if (!Array.isArray(auditorOrgIds) || auditorOrgIds.length === 0) {
      return res.status(400).json({ error: "auditorOrgIds is required" });
    }
    if (rfq.status === "DRAFT") {
      return res.status(400).json({ error: "Publish RFQ before inviting auditors" });
    }

    const nextInvites = [...(rfq.invitedAuditors || [])];
    const newInvites = [];
    auditorOrgIds.forEach((orgId) => {
      if (!orgId) return;
      const existing = nextInvites.find((inv) => String(inv.auditorOrgId) === String(orgId));
      if (existing) {
        existing.status = "INVITED";
        existing.invitedAt = new Date();
        existing.invitedBy = req.user?._id;
      } else {
        const invite = {
          auditorOrgId: String(orgId),
          invitedBy: req.user?._id,
          invitedAt: new Date(),
          status: "INVITED",
        };
        nextInvites.push(invite);
        newInvites.push(invite);
      }
    });

    rfq.invitedAuditors = nextInvites;
    rfq.updatedBy = req.user?._id;
    rfq.auditTrail.push(buildAuditTrail(req, "INVITED", "Auditors invited", { auditorOrgIds }));
    await rfq.save();

    for (const invite of newInvites) {
      const auditors = await User.find({ tenant_id: invite.auditorOrgId, role: AUDITOR_ROLE, status: "ACTIVE" }).select("_id");
      const recipients = auditors.map((u) => u._id);
      await notifyUsers({
        tenantId: invite.auditorOrgId,
        recipientUserIds: recipients,
        title: `New RFQ invitation: ${rfq.title || rfq.rfqNumber}`,
        message: `You have been invited to quote on RFQ ${rfq.rfqNumber}.`,
        action: { url: `/auditor/rfqs/${rfq._id}`, label: "View RFQ" },
        entityId: rfq._id,
      });
    }

    return res.json({ success: true, data: rfq });
  } catch (error) {
    console.error("inviteAuditors error", error);
    return res.status(500).json({ error: "Failed to invite auditors" });
  }
};

export const listRfqs = async (req, res) => {
  try {
    const { status, closingSoon, myInvites } = req.query;
    const query = {};
    const now = new Date();

    if (BUYER_ROLES.includes(req.user?.role)) {
      query.tenantId = req.tenantId;
    } else if (req.user?.role === AUDITOR_ROLE) {
      query["invitedAuditors.auditorOrgId"] = req.tenantId;
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (status) {
      const statuses = String(status)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (statuses.length) query.status = { $in: statuses };
    }
    if (closingSoon === "true") {
      const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      query.closingAt = { $gte: now, $lte: soon };
    }
    if (myInvites === "true" && req.user?.role === AUDITOR_ROLE) {
      query["invitedAuditors.auditorOrgId"] = req.tenantId;
    }

    const rfqs = await AuditRFQ.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: rfqs });
  } catch (error) {
    console.error("listRfqs error", error);
    return res.status(500).json({ error: "Failed to load RFQs" });
  }
};

export const getRfq = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id).lean();
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    assertRfqAccess(req, rfq);
    return res.json({ success: true, data: rfq });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: status === 403 ? "Forbidden" : "Failed to load RFQ" });
  }
};

export const postThreadMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id).lean();
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    assertRfqAccess(req, rfq);
    if (!checkRateLimit(`rfq:thread:${req.user?._id}`)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const { visibility = "PUBLIC_TO_ALL_INVITED", privateAuditorOrgId, text, attachments = [] } = req.body || {};
    if (!text) return res.status(400).json({ error: "Message text is required" });
    if (visibility === "PRIVATE_TO_AUDITOR" && !privateAuditorOrgId) {
      return res.status(400).json({ error: "privateAuditorOrgId is required for private threads" });
    }
    if (visibility === "PRIVATE_TO_AUDITOR") {
      const targetOrgId = String(privateAuditorOrgId);
      if (req.user?.role === AUDITOR_ROLE && String(req.tenantId) !== targetOrgId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const isInvited = (rfq.invitedAuditors || []).some((inv) => String(inv.auditorOrgId) === targetOrgId);
      if (!isInvited) {
        return res.status(400).json({ error: "Auditor is not invited to this RFQ" });
      }
    }

    const thread = await AuditRFQThread.findOneAndUpdate(
      { rfqId: rfq._id, visibility, privateAuditorOrgId: privateAuditorOrgId || null },
      {
        $push: {
          messages: {
            senderRole: req.user?.role,
            senderUserId: req.user?._id,
            text: trimText(text, 2000),
            attachments,
            createdAt: new Date(),
          },
        },
      },
      { new: true, upsert: true }
    );

    if (visibility === "PUBLIC_TO_ALL_INVITED") {
      if (BUYER_ROLES.includes(req.user?.role)) {
        const auditorOrgs = (rfq.invitedAuditors || []).map((inv) => inv.auditorOrgId);
        for (const orgId of auditorOrgs) {
          const auditors = await User.find({ tenant_id: orgId, role: AUDITOR_ROLE, status: "ACTIVE" }).select("_id");
          await notifyUsers({
            tenantId: orgId,
            recipientUserIds: auditors.map((u) => u._id),
            title: `RFQ Q&A update: ${rfq.rfqNumber}`,
            message: "A new question or response was posted.",
            action: { url: `/auditor/rfqs/${rfq._id}`, label: "View thread" },
            entityId: rfq._id,
          });
        }
      }
      if (req.user?.role === AUDITOR_ROLE) {
        const buyers = await User.find({ tenant_id: rfq.tenantId, role: { $in: BUYER_ROLES }, status: "ACTIVE" }).select("_id");
        await notifyUsers({
          tenantId: rfq.tenantId,
          recipientUserIds: buyers.map((u) => u._id),
          title: `RFQ Q&A update: ${rfq.rfqNumber}`,
          message: "An auditor posted a Q&A message.",
          action: { url: `/rfqs/${rfq._id}`, label: "View thread" },
          entityId: rfq._id,
        });
      }
    } else if (privateAuditorOrgId) {
      const auditors = await User.find({ tenant_id: privateAuditorOrgId, role: AUDITOR_ROLE, status: "ACTIVE" }).select("_id");
      if (auditors.length) {
        await notifyUsers({
          tenantId: privateAuditorOrgId,
          recipientUserIds: auditors.map((u) => u._id),
          title: `Private RFQ Q&A update: ${rfq.rfqNumber}`,
          message: "A private Q&A message was posted.",
          action: { url: `/auditor/rfqs/${rfq._id}`, label: "View thread" },
          entityId: rfq._id,
        });
      }
      if (req.user?.role === AUDITOR_ROLE || BUYER_ROLES.includes(req.user?.role)) {
        const buyers = await User.find({ tenant_id: rfq.tenantId, role: { $in: BUYER_ROLES }, status: "ACTIVE" }).select("_id");
        if (buyers.length) {
          await notifyUsers({
            tenantId: rfq.tenantId,
            recipientUserIds: buyers.map((u) => u._id),
            title: `Private RFQ Q&A update: ${rfq.rfqNumber}`,
            message: "A private Q&A message was posted.",
            action: { url: `/rfqs/${rfq._id}`, label: "View thread" },
            entityId: rfq._id,
          });
        }
      }
    }

    return res.status(201).json({ success: true, data: thread });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: status === 403 ? "Forbidden" : "Failed to post message" });
  }
};

export const getThreadMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id).lean();
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    assertRfqAccess(req, rfq);

    let query = { rfqId: rfq._id };
    if (req.user?.role === AUDITOR_ROLE) {
      query = {
        rfqId: rfq._id,
        $or: [
          { visibility: "PUBLIC_TO_ALL_INVITED" },
          { visibility: "PRIVATE_TO_AUDITOR", privateAuditorOrgId: req.tenantId },
        ],
      };
    }

    const threads = await AuditRFQThread.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: threads });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: status === 403 ? "Forbidden" : "Failed to load threads" });
  }
};

export const submitQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id).lean();
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    if (!canAuditorAccess(req, rfq)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (rfq.closingAt && new Date(rfq.closingAt) < new Date()) {
      return res.status(400).json({ error: "RFQ is closed for submissions" });
    }
    if (!checkRateLimit(`rfq:quote:${req.user?._id}`)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const existing = await AuditRFQQuote.findOne({ rfqId: rfq._id, auditorUserId: req.user?._id });
    if (existing && existing.status !== "WITHDRAWN") {
      return res.status(409).json({ error: "Quote already exists. Use revise endpoint." });
    }

    const lineItems = normalizeLineItems(req.body?.lineItems || []);
    const totals = computeTotals(lineItems, req.body?.totals?.tax || 0);
    const quote = await AuditRFQQuote.create({
      rfqId: rfq._id,
      auditorOrgId: req.tenantId,
      auditorUserId: req.user?._id,
      lineItems,
      currency: trimText(req.body?.currency || "USD", 8),
      totals,
      proposedSchedule: {
        auditDays: Number(req.body?.proposedSchedule?.auditDays || 0),
        reportDays: Number(req.body?.proposedSchedule?.reportDays || 0),
        earliestStartDate: req.body?.proposedSchedule?.earliestStartDate
          ? new Date(req.body.proposedSchedule.earliestStartDate)
          : undefined,
        latestStartDate: req.body?.proposedSchedule?.latestStartDate
          ? new Date(req.body.proposedSchedule.latestStartDate)
          : undefined,
      },
      assumptionsText: trimText(req.body?.assumptionsText, 2000),
      exclusionsText: trimText(req.body?.exclusionsText, 2000),
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      status: "SUBMITTED",
      submittedAt: new Date(),
      auditTrail: [buildAuditTrail(req, "SUBMITTED", "Quote submitted")],
    });

    await AuditRFQ.updateOne(
      { _id: rfq._id, status: { $ne: "QUOTES_RECEIVED" } },
      {
        $set: { status: "QUOTES_RECEIVED", updatedBy: req.user?._id },
        $push: { auditTrail: buildAuditTrail(req, "QUOTE_SUBMITTED", "Quote submitted") },
      }
    );

    const buyerUsers = await User.find({ tenant_id: rfq.tenantId, role: { $in: BUYER_ROLES }, status: "ACTIVE" }).select("_id");
    await notifyUsers({
      tenantId: rfq.tenantId,
      recipientUserIds: buyerUsers.map((u) => u._id),
      title: `New RFQ quote submitted: ${rfq.rfqNumber}`,
      message: "An auditor submitted a quote.",
      action: { url: `/rfqs/${rfq._id}/quotes`, label: "Review quote" },
      entityId: rfq._id,
    });

    return res.status(201).json({ success: true, data: quote });
  } catch (error) {
    console.error("submitQuote error", error);
    return res.status(500).json({ error: "Failed to submit quote" });
  }
};

export const reviseQuote = async (req, res) => {
  try {
    const { id, quoteId } = req.params;
    const rfq = await AuditRFQ.findById(id).lean();
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    if (!canAuditorAccess(req, rfq)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (rfq.closingAt && new Date(rfq.closingAt) < new Date()) {
      return res.status(400).json({ error: "RFQ is closed for revisions" });
    }
    const quote = await AuditRFQQuote.findOne({ _id: quoteId, auditorUserId: req.user?._id });
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    if (["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(quote.status)) {
      return res.status(400).json({ error: "Quote cannot be revised in current status" });
    }

    const lineItems = normalizeLineItems(req.body?.lineItems || []);
    const totals = computeTotals(lineItems, req.body?.totals?.tax || 0);
    quote.lineItems = lineItems;
    quote.currency = trimText(req.body?.currency || quote.currency, 8);
    quote.totals = totals;
    quote.proposedSchedule = {
      auditDays: Number(req.body?.proposedSchedule?.auditDays || quote.proposedSchedule?.auditDays || 0),
      reportDays: Number(req.body?.proposedSchedule?.reportDays || quote.proposedSchedule?.reportDays || 0),
      earliestStartDate: req.body?.proposedSchedule?.earliestStartDate
        ? new Date(req.body.proposedSchedule.earliestStartDate)
        : quote.proposedSchedule?.earliestStartDate,
      latestStartDate: req.body?.proposedSchedule?.latestStartDate
        ? new Date(req.body.proposedSchedule.latestStartDate)
        : quote.proposedSchedule?.latestStartDate,
    };
    quote.assumptionsText = trimText(req.body?.assumptionsText, 2000);
    quote.exclusionsText = trimText(req.body?.exclusionsText, 2000);
    quote.attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : quote.attachments;
    quote.status = "REVISED";
    quote.revisedAt = new Date();
    quote.auditTrail.push(buildAuditTrail(req, "REVISED", "Quote revised"));
    await quote.save();

    await notifyUsers({
      tenantId: rfq.tenantId,
      recipientUserIds: (
        await User.find({ tenant_id: rfq.tenantId, role: { $in: BUYER_ROLES }, status: "ACTIVE" }).select("_id")
      ).map((u) => u._id),
      title: `Quote revised: ${rfq.rfqNumber}`,
      message: "An auditor revised their quote.",
      action: { url: `/rfqs/${rfq._id}/quotes`, label: "Review quote" },
      entityId: rfq._id,
    });

    return res.json({ success: true, data: quote });
  } catch (error) {
    console.error("reviseQuote error", error);
    return res.status(500).json({ error: "Failed to revise quote" });
  }
};

export const listQuotes = async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await AuditRFQ.findById(id).lean();
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    assertRfqAccess(req, rfq);

    let query = { rfqId: rfq._id };
    if (req.user?.role === AUDITOR_ROLE) {
      query = { ...query, auditorUserId: req.user?._id };
    }

    const quotes = await AuditRFQQuote.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: quotes });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: status === 403 ? "Forbidden" : "Failed to load quotes" });
  }
};

export const awardQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const { quoteId } = req.body || {};
    const rfq = await AuditRFQ.findById(id);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    if (!canBuyerAccess(req, rfq)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!quoteId || !isValidObjectId(quoteId)) {
      return res.status(400).json({ error: "quoteId is required" });
    }

    const quote = await AuditRFQQuote.findById(quoteId);
    if (!quote || String(quote.rfqId) !== String(rfq._id)) {
      return res.status(404).json({ error: "Quote not found for RFQ" });
    }

    const auditorUser = await User.findById(quote.auditorUserId);
    if (!auditorUser || auditorUser.role !== AUDITOR_ROLE) {
      return res.status(400).json({ error: "Invalid auditor user" });
    }

    const supplierUser = await User.findById(rfq.supplierOrgId);
    if (!supplierUser || supplierUser.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier on RFQ" });
    }

    const mapping = await pickMapping({
      supplierId: rfq.supplierOrgId,
      siteId: rfq.siteId,
      productIds: rfq.productIds || [],
    });
    if (!mapping) {
      return res.status(400).json({ error: "No valid supplier product mapping found" });
    }

    const masterProduct = await SupplierMasterProducts.findById(mapping.product_id).lean();
    if (!masterProduct) {
      return res.status(400).json({ error: "Product not found" });
    }

    const site = rfq.siteId ? await SupplierSite.findById(rfq.siteId).lean() : null;

    const internalSeq = await getNextSequence("audit:global");
    const supplierSeq = await getNextSequence(`audit:supplier:${supplierUser._id}`);
    const internalRequestId = `REQ-${String(internalSeq).padStart(6, "0")}`;
    const supplierRequestId = `REQ-${String(supplierSeq).padStart(4, "0")}`;

    const auditorProfile = await AuditorProfile.findOne({ user_id: auditorUser._id }).lean();
    const assignedAuditors = auditorProfile
      ? [
          {
            auditorProfileId: auditorProfile._id,
            role: "LEAD",
            permissions: [],
            assignedAt: new Date(),
            assignedBy: req.user?._id,
          },
        ]
      : [];

    const complianceDate =
      rfq.preferredWindow?.startDate || rfq.preferredWindow?.endDate || rfq.closingAt || new Date();
    const timeDiffSec = moment(complianceDate).diff(moment(), "seconds") / 9;

    const auditRequest = await AuditRequestMaster.create({
      internalRequestId,
      internalSequence: internalSeq,
      supplierRequestId,
      supplierSequence: supplierSeq,
      tenantOrgId: rfq.tenantId,
      supplier_id: supplierUser._id,
      auditor_id: auditorUser._id,
      create_by_buyer_id: req.user?._id,
      supplier_product_id: masterProduct._id,
      complianceDate,
      site_id: rfq.siteId,
      high_status: 1,
      trackStatus: "Request Received",
      questionnaireStatus: "request_received",
      assignedAuditors,
      rfqId: rfq._id,
      awardedQuoteId: quote._id,
      requestReviewInProgressEta: moment().add(timeDiffSec, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      requestReviewCompleteEta: moment().add(timeDiffSec * 2, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      questionnaireSentEta: moment().add(timeDiffSec * 3, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      questionnaireReceivedEta: moment().add(timeDiffSec * 4, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      responseInProgressEta: moment().add(timeDiffSec * 5, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      responseCompleteEta: moment().add(timeDiffSec * 6, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      responseReceivedEta: moment().add(timeDiffSec * 7, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      responseReviewInProgressEta: moment().add(timeDiffSec * 8, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
      responseReviewCompleteEta: moment().add(timeDiffSec * 9, "seconds").format("MMMM Do YYYY, h:mm:ss a"),
    });
    await syncMilestonesFromStatus({
      auditId: auditRequest._id,
      tenantId: rfq.tenantId,
      trackStatus: auditRequest.trackStatus,
      questionnaireStatus: auditRequest.questionnaireStatus,
    });

    await AuditRFQQuote.updateMany(
      { rfqId: rfq._id, _id: { $ne: quote._id } },
      {
        $set: { status: "REJECTED" },
        $push: { auditTrail: buildAuditTrail(req, "REJECTED", "Quote rejected") },
      }
    );
    quote.status = "ACCEPTED";
    quote.auditTrail.push(buildAuditTrail(req, "ACCEPTED", "Quote accepted"));
    await quote.save();

    rfq.status = "CONVERTED";
    rfq.auditRequestId = auditRequest._id;
    rfq.updatedBy = req.user?._id;
    rfq.auditTrail.push(buildAuditTrail(req, "AWARDED", "Quote awarded"));
    await rfq.save();

    await notifyUsers({
      tenantId: quote.auditorOrgId,
      recipientUserIds: [auditorUser._id],
      title: `RFQ awarded: ${rfq.rfqNumber}`,
      message: "Your quote was selected and converted to an audit request.",
      action: { url: `/audits/${auditRequest._id}/template`, label: "Start audit" },
      entityId: rfq._id,
    });

    const otherQuotes = await AuditRFQQuote.find({ rfqId: rfq._id, _id: { $ne: quote._id } }).select(
      "auditorUserId auditorOrgId"
    );
    for (const other of otherQuotes) {
      await notifyUsers({
        tenantId: other.auditorOrgId,
        recipientUserIds: [other.auditorUserId],
        title: `RFQ update: ${rfq.rfqNumber}`,
        message: "Another quote was selected for this RFQ.",
        action: { url: `/auditor/rfqs/${rfq._id}`, label: "View RFQ" },
        entityId: rfq._id,
      });
    }

    return res.json({ success: true, data: { auditRequestId: auditRequest._id } });
  } catch (error) {
    console.error("awardQuote error", error);
    return res.status(500).json({ error: "Failed to award quote" });
  }
};
