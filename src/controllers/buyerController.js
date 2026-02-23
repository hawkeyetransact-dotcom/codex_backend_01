import { User } from "../models/userModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditorAffiliation } from "../models/auditorAffiliationModel.js";
import { AvailabilityBlock } from "../models/availabilityBlockModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { Template } from "../models/templateModel.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendMail } from "../helpers/mailHelper.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { getNextSequence } from "../utils/sequenceGenerator.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import { ENABLE_NEW_REQUEST_IDS } from "../config/featureFlags.js";
import { ensureAuditRequestIds } from "../services/requestIdService.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";
import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import mongoose from "mongoose";
import { resolveDefaultTemplateId } from "../utils/templateDefaults.js";
import { AUDIT_ARTIFACT_TYPES } from "../constants/auditPhases.js";

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };
const roleLabel = (role) => {
  if (!role) return "User";
  const normalized = String(role).toLowerCase();
  if (normalized === "tenant_admin") return "Tenant Admin";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
const normalizeRole = (value) => String(value || "").toLowerCase().replace(/[\s_-]/g, "");
const resolveAuditRequestLabel = (audit) =>
  audit?.hawkeyeRequestId || audit?.internalRequestId || audit?.supplierRequestId || String(audit?._id || "");

const DEFAULT_REQUIRED_ARTIFACTS = new Set([
  "INTIMATION_LETTER",
  "SCOPE",
  "AGENDA",
  "EXECUTION_QUESTIONNAIRE",
  "FINDINGS_LOG",
  "FINAL_REPORT",
]);
const AUDITOR_PLACEHOLDER_NAME = "TBD";

const buildIntimationArtifactData = ({ existingData, required }) => {
  const nextData = existingData && typeof existingData === "object" ? { ...existingData } : {};
  nextData.required = Boolean(required);
  const signatures =
    nextData.signatures && typeof nextData.signatures === "object" ? { ...nextData.signatures } : {};
  const auditorName = String(signatures.auditorName || "").trim();
  if (!auditorName) {
    signatures.auditorName = AUDITOR_PLACEHOLDER_NAME;
  }
  nextData.signatures = signatures;
  return nextData;
};

const normalizeArtifactChecklist = (rawChecklist) => {
  const requiredByType = new Map(
    AUDIT_ARTIFACT_TYPES.map((artifactType) => [artifactType, DEFAULT_REQUIRED_ARTIFACTS.has(artifactType)])
  );

  if (Array.isArray(rawChecklist)) {
    rawChecklist.forEach((item) => {
      const artifactType = String(item?.artifactType || "").toUpperCase().trim();
      if (!requiredByType.has(artifactType)) return;
      const required = Boolean(item?.required);
      requiredByType.set(artifactType, required);
      if (artifactType === "SCOPE") {
        requiredByType.set("AGENDA", required);
      }
      if (artifactType === "AGENDA") {
        requiredByType.set("SCOPE", required);
      }
    });
  }

  return Array.from(requiredByType.entries()).map(([artifactType, required]) => ({
    artifactType,
    required,
  }));
};

const buildArtifactRequiredMap = (artifactChecklist = []) => {
  const map = new Map(
    normalizeArtifactChecklist(artifactChecklist).map((item) => [
      item.artifactType,
      Boolean(item.required),
    ])
  );
  return map;
};

const isArtifactRequired = (artifactRequiredMap, artifactType) => {
  const normalized = String(artifactType || "").toUpperCase();
  if (!normalized) return false;
  if (!artifactRequiredMap || typeof artifactRequiredMap.get !== "function") {
    return DEFAULT_REQUIRED_ARTIFACTS.has(normalized);
  }
  if (artifactRequiredMap.has(normalized)) {
    return Boolean(artifactRequiredMap.get(normalized));
  }
  return DEFAULT_REQUIRED_ARTIFACTS.has(normalized);
};

const parseObjId = (val) => {
  if (!val) return undefined;
  try {
    return mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : undefined;
  } catch {
    return undefined;
  }
};

const addBusinessDays = (startDate, days) => {
  const result = new Date(startDate);
  result.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return result;
};

const addCalendarDays = (startDate, days) => {
  const result = new Date(startDate);
  result.setDate(result.getDate() + Number(days || 0));
  return result;
};

const TERMINAL_TRACK_STATUS_KEYWORDS = [
  "closed",
  "completed",
  "rejected",
  "declined",
  "cancelled",
  "canceled",
  "archived",
];

const hasTerminalStatusKeyword = (rawValue) => {
  const normalized = String(rawValue || "").toLowerCase();
  if (!normalized) return false;
  return TERMINAL_TRACK_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const hasCompletedClosurePhase = (audit) => {
  const phaseState = audit?.phaseState;
  if (!phaseState || typeof phaseState !== "object") return false;
  const closurePhase =
    phaseState.phases && typeof phaseState.phases === "object"
      ? phaseState.phases.CLOSURE
      : null;
  return String(closurePhase?.status || "").toUpperCase() === "COMPLETED";
};

const isAuditRequestInProgress = (audit) => {
  if (!audit || audit.isArchived) return false;
  if (hasCompletedClosurePhase(audit)) return false;

  const numericStatus = Number(audit.high_status);
  if (Number.isFinite(numericStatus) && numericStatus >= 5) return false;

  if (hasTerminalStatusKeyword(audit.trackStatus) || hasTerminalStatusKeyword(audit.high_status)) {
    return false;
  }

  return true;
};

const resolveSupplierSequence = async ({ tenantOrgId, supplierId }) => {
  const tenantSequenceKey = `audit:tenant:${tenantOrgId || "global"}`;
  const [nextSeq, latest] = await Promise.all([
    getNextSequence(tenantSequenceKey),
    AuditRequestMaster.findOne({
      supplier_id: supplierId,
      supplierSequence: { $ne: null },
    })
      .sort({ supplierSequence: -1 })
      .select("supplierSequence")
      .lean(),
  ]);
  const maxSeq = Number(latest?.supplierSequence) || 0;
  return nextSeq > maxSeq ? nextSeq : maxSeq + 1;
};

const isSupplierSequenceDuplicate = (error) =>
  error?.code === 11000 && error?.keyPattern?.supplier_id && error?.keyPattern?.supplierSequence;

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
  return WorkflowMilestoneInstance.create({
    ...filter,
    status: "NOT_STARTED",
  });
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
  if (desiredRank < currentRank || current?.status === desiredStatus) return;

  if (desiredStatus === "IN_PROGRESS") {
    await WorkflowMilestoneService.markMilestoneStarted(auditId, code, { tenantId, role: "system" });
    return;
  }

  if (desiredStatus === "COMPLETED") {
    await WorkflowMilestoneService.markMilestoneCompleted(auditId, code, { tenantId, role: "system" });
    return;
  }

  const update = { status: desiredStatus, updatedAt: new Date() };
  if (desiredStatus === "SKIPPED") update.completedAt = new Date();
  await WorkflowMilestoneInstance.findOneAndUpdate(filter, update, { new: true, upsert: true });
};

const syncMilestonesFromStatus = async ({ audit, trackStatus, questionnaireStatus, nextAuditOn }) => {
  const auditId = audit?._id;
  const tenantId = await resolveAuditWorkflowTenantId({
    auditId,
    fallbackTenantId: parseObjId(audit?.tenantOrgId || audit?.tenant_id || audit?.tenantId),
  });
  if (!tenantId || !auditId) return;
  const statusNorm = (trackStatus || "").toLowerCase();
  const qStatus = (questionnaireStatus || "").toLowerCase();
  const hasAuditor = Boolean(audit?.auditor_id);

  // Request submitted -> reviewer picks it up
  if (statusNorm.includes("request") || statusNorm.includes("intimation") || qStatus === "request_received") {
    await advanceMilestone({ tenantId, auditId, code: "AR_CREATED", desiredStatus: "COMPLETED" });
    if (hasAuditor) {
      await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ASSIGNED", desiredStatus: "COMPLETED" });
      await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "IN_PROGRESS" });
    }
  }

  if (statusNorm.includes("auditor selected") || statusNorm.includes("auditor assigned")) {
    if (hasAuditor) {
      await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ASSIGNED", desiredStatus: "COMPLETED" });
      await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "IN_PROGRESS" });
    }
  }

  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "TEMPLATE_SELECTION_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_RELEASED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "supplier_draft") {
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed")) {
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_SUBMITTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "followup_requested") {
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_REQUESTED", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "followup_submitted") {
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_REQUESTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_RESPONSES_SUBMITTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FINAL_REVIEW_AND_SIGNOFF", desiredStatus: "IN_PROGRESS" });
  }
};



export const getAuditors = async (req, res) => {
  const { page = 1, limit = 100, auditorType = "all", availableFrom, availableTo } = req.query;
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.max(Number(limit) || 100, 1);
  const normalizedType = String(auditorType || "all").toLowerCase();
  try {
    const baseQuery = { role: "auditor", status: "ACTIVE" };
    let auditors = [];
    let countQuery = { ...baseQuery };

    const tenantId = req.tenantId;
    let scopedUserIds = null;

    if (tenantId) {
      const affFilter = { orgTenantId: tenantId, status: "ACTIVE" };
      if (normalizedType === "internal") affFilter.affiliationType = "INTERNAL";
      if (normalizedType === "external") affFilter.affiliationType = "EXTERNAL";
      const affiliations = await AuditorAffiliation.find(affFilter).lean();
      if (affiliations.length) {
        const profileIds = affiliations.map((a) => a.auditorProfileId).filter(Boolean);
        const profiles = await AuditorProfile.find({ _id: { $in: profileIds } }).select("user_id").lean();
        const userIds = profiles.map((p) => p.user_id).filter(Boolean);
        if (userIds.length) {
          scopedUserIds = userIds;
        }
      } else if (normalizedType === "internal") {
        baseQuery.tenant_id = tenantId;
        countQuery = { ...baseQuery };
      } else if (normalizedType === "external") {
        baseQuery.tenant_id = { $ne: tenantId };
        countQuery = { ...baseQuery };
      }
    }

    if (scopedUserIds) {
      baseQuery._id = { $in: scopedUserIds };
      countQuery = { ...baseQuery };
    }

    auditors = await User.find(baseQuery)
      .select("-password -__v")
      .limit(normalizedLimit)
      .skip((normalizedPage - 1) * normalizedLimit);

    if (availableFrom && availableTo && auditors.length) {
      const start = new Date(availableFrom);
      const end = new Date(availableTo);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const busyBlocks = await AvailabilityBlock.find({
          ownerType: "auditor",
          ownerId: { $in: auditors.map((a) => a._id) },
          blockType: { $in: ["blackout", "conditional"] },
          start: { $lt: end },
          end: { $gt: start },
        })
          .select("ownerId")
          .lean();
        const busySet = new Set(busyBlocks.map((b) => String(b.ownerId)));
        auditors = auditors.filter((a) => !busySet.has(String(a._id)));
      }
    }

    const auditorIds = auditors.map((a) => a._id);
    const profiles = await AuditorProfile.find({ user_id: { $in: auditorIds } }).lean();
    const profileMap = new Map(profiles.map((p) => [String(p.user_id), p]));
    const beforeProfileFilter = auditors.length;
    auditors = auditors.filter((auditor) => profileMap.has(String(auditor._id)));
    const enrichedAuditors = auditors.map((auditor) => ({
      ...(auditor.toObject?.() ? auditor.toObject() : auditor),
      profile: profileMap.get(String(auditor._id)) || null,
    }));

    let totalRecords = await User.countDocuments(countQuery);
    if (availableFrom && availableTo) {
      totalRecords = auditors.length;
    }
    if (beforeProfileFilter !== auditors.length) {
      totalRecords = auditors.length;
    }
    const totalPages = Math.ceil(totalRecords / normalizedLimit);

    res.status(200).json({
      auditors: enrichedAuditors,
      totalRecords,
      totalPages,
      currentPage: normalizedPage,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const inviteAuditor = async (req, res) => {
  try {
    const { email, firstName, lastName, countryCode, phone } = req.body || {};
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const tenantId = req.tenantId || req.user?.tenant_id || null;
    const tempPassword = crypto.randomBytes(6).toString("hex");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      role: "auditor",
      tenant_id: tenantId,
      invitedBy: req.user?._id || null,
      isEmailVerified: true,
    });

    await AuditorProfile.create({
      user_id: user._id,
      firstName,
      lastName,
      countryCode,
      phone,
      tenant_id: tenantId,
      isProfileCompleted: false,
    });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const origin = req.headers.origin || req.headers.referer || "";
    const baseUrl = (process.env.FE_BASE_URL || origin || "").replace(/\/$/, "");
    const resetLink = `${baseUrl}/auth/reset?token=${token}`;

    try {
      await sendMail(
        email,
        "You're invited to Hawkeye as an Auditor",
        `Hi ${firstName || "Auditor"},\n\nYou've been invited to Hawkeye. Please set your password using the link below:\n${resetLink}\n\nYou can then log in with your email.\n`
      );
    } catch (mailErr) {
      console.error("[inviteAuditor] mail error", mailErr.message);
    }

    return res.status(201).json({ message: "Auditor invited successfully", userId: user._id });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to invite auditor" });
  }
};
export const getAllSuppliers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    // Populate user details
    const supplierProfiles = await SupplierProfile.find()
      .populate('user_id', 'firstName lastName email title addressline1 addressline2 addressline3 city state country zipcode')
      .limit(Number(limit))
      .skip(skip);

    // Format to what frontend expects
    const suppliers = supplierProfiles.map((profile) => {
      const user = profile.user_id;
      return {
        _id: profile._id,
        user_id: user?._id || null,
        companyName: profile.companyName,
        email: user?.email || '',
        firstName: user?.firstName || profile?.firstName,
        lastName: user?.lastName || profile?.lastName,
        title: user?.title || profile?.title,
        addressline1: user?.addressline1 || profile?.addressline1,
        addressline2: user?.addressline2 || profile?.addressline2,
        addressline3: user?.addressline3 || profile?.addressline3,
        city: user?.city || profile?.city,
        state: user?.state || profile?.state,
        country: user?.country || profile?.country,
        zipcode: user?.zipcode || profile?.zipcode,
        productCount: profile.productCount || 0,
        siteCount: profile.siteCount || 0,
      };
    });

    const totalRecords = await SupplierProfile.countDocuments();

    res.status(200).json({
      suppliers,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error('[getAllSuppliers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getAllSuppliersProfile = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    const suppliersProfile = await SupplierProfile.find()
      .select("-password -__v")
      .limit(Number(limit))
      .skip(skip)
      .lean();

    const userIds = suppliersProfile.map((profile) => profile.user_id);

    const counts = await ProductSiteMappings.aggregate([
      {
        $match: {
          user_id: { $in: userIds },
        },
      },
      {
        $group: {
          _id: "$user_id",
          productIds: { $addToSet: "$product_id" },
          siteIds: { $addToSet: "$site_id" },
        },
      },
      {
        $project: {
          _id: 1,
          productCount: { $size: "$productIds" },
          siteCount: { $size: "$siteIds" },
        },
      },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id.toString()] = {
        productCount: c.productCount,
        siteCount: c.siteCount,
      };
    });

    // Merge counts into plain JS objects
    const enrichedProfiles = suppliersProfile.map((profile) => {
      const count = countMap[profile.user_id.toString()] || {
        productCount: 0,
        siteCount: 0,
      };
      return {
        ...profile,
        ...count,
      };
    });

    const totalRecords = await SupplierProfile.countDocuments();

    res.status(200).json({
      suppliersProfile: enrichedProfiles,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
};



// GET /api/buyer/sites - Fetch all supplier sites (irrespective of supplier)
export const getSites = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const sites = await SupplierSite.find()
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await SupplierSite.countDocuments();
    res.status(200).json({
      sites,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/buyer/site-products/:id - Fetch products linked to a specific site
export const getSiteProducts = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  try {
    const mappings = await ProductSiteMappings.find({ site_id: id })
      .populate("product_id")
      .populate("apiMasterId")
      .populate("site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await ProductSiteMappings.countDocuments({
      site_id: id,
    });
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  try {
    const pipeline = [
      // Lookup product details from supplier-master-products
      {
        $lookup: {
          from: "supplier-master-products", // collection name as defined in your model
          localField: "product_id",
          foreignField: "_id",
          as: "product_id",
        },
      },
      // Unwind to convert product_id array to a single object; filter out if missing
      { $unwind: { path: "$product_id", preserveNullAndEmptyArrays: false } },

      // Lookup user details from users collection
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user_id",
        },
      },
      { $unwind: { path: "$user_id", preserveNullAndEmptyArrays: true } },

      // Lookup site details from supplier-sites collection
      {
        $lookup: {
          from: "supplier-sites",
          localField: "site_id",
          foreignField: "_id",
          as: "site_id",
        },
      },
      { $unwind: { path: "$site_id", preserveNullAndEmptyArrays: true } },

      // Lookup API master details
      {
        $lookup: {
          from: "api-masters",
          localField: "apiMasterId",
          foreignField: "_id",
          as: "apiMasterId",
        },
      },
      { $unwind: { path: "$apiMasterId", preserveNullAndEmptyArrays: true } },

      // Facet to get paginated results and total count in one go
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: Number(limit) }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const results = await ProductSiteMappings.aggregate(pipeline);
    const data = results[0].data;
    const totalRecords = results[0].totalCount[0]
      ? results[0].totalCount[0].count
      : 0;

    res.status(200).json({
      mappings: data,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSuppliersByProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const productId = parseObjId(id);
    if (!productId) {
      return res.status(400).json({ error: "Invalid product id" });
    }
    const mappings = await ProductSiteMappings.find({ product_id: productId })
      .populate("site_id")
      .populate("product_id")
      .populate("apiMasterId")
      .populate("user_id", "firstName lastName email")
      .lean();
    if (!mappings.length) {
      return res.status(404).json({ error: "No suppliers found for this product" });
    }

    const supplierIds = Array.from(new Set(mappings.map((m) => String(m.user_id?._id || m.user_id)).filter(Boolean)));
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: supplierIds } }).lean();
    const profileMap = new Map(supplierProfiles.map((profile) => [String(profile.user_id), profile]));

    const siteIds = mappings.map((mapping) => mapping.site_id?._id).filter(Boolean);
    const auditSnapshots =
      supplierIds.length && siteIds.length
        ? await AuditRequestMaster.aggregate([
            {
              $match: {
                supplier_id: { $in: supplierIds.map((sid) => parseObjId(sid)).filter(Boolean) },
                site_id: { $in: siteIds },
                supplier_product_id: productId,
              },
            },
            { $sort: { updatedAt: -1 } },
            {
              $group: {
                _id: { site_id: "$site_id", supplier_id: "$supplier_id" },
                audit: { $first: "$$ROOT" },
              },
            },
          ])
        : [];

    const auditMap = new Map(
      auditSnapshots.map((entry) => [
        `${String(entry._id.supplier_id)}-${String(entry._id.site_id)}`,
        entry.audit,
      ])
    );

    const isCompleted = (audit) => {
      const raw = String(audit?.high_status || audit?.trackStatus || "").toLowerCase();
      if (raw.includes("complete") || raw.includes("closed")) return true;
      const numeric = Number(audit?.high_status);
      return Number.isFinite(numeric) && numeric >= 5;
    };

    const supplierMap = new Map();
    mappings.forEach((mapping) => {
      const supplierId = String(mapping.user_id?._id || mapping.user_id);
      if (!supplierId) return;
      const supplierProfile = profileMap.get(supplierId);
      const site = mapping.site_id;
      const audit = auditMap.get(`${supplierId}-${String(site?._id)}`);
      const completed = isCompleted(audit);
      const sitePayload = site
        ? {
            ...site,
            auditStatus: audit?.trackStatus || audit?.high_status || null,
            lastAuditDate: audit ? (completed ? audit.updatedAt : audit.createdAt) : null,
            complianceStatus: audit?.complianceStatus || "",
          }
        : null;

      if (!supplierMap.has(supplierId)) {
        supplierMap.set(supplierId, {
          supplierId,
          supplierProfileInfo: supplierProfile || {},
          supplierUser: mapping.user_id || null,
          sites: sitePayload ? [sitePayload] : [],
        });
      } else if (sitePayload) {
        supplierMap.get(supplierId).sites.push(sitePayload);
      }
    });

    const product = mappings[0]?.product_id || (await SupplierMasterProducts.findById(productId).lean());
    return res.status(200).json({
      product,
      suppliers: Array.from(supplierMap.values()),
      totalSuppliers: supplierMap.size,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createAuditRequest = async (req, res) => {
  const { supplier_id, auditor_id, supplier_product_id, complianceDate, auditETA, site_id } = req.body;

  const create_by_buyer_id = req.user._id;

  try {
    // Verify supplier_id is a user with role "supplier"
    const supplier = await User.findOne({ _id: supplier_id });
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier_id" });
    }

    const hasAuditor = Boolean(auditor_id);
    let auditor = null;
    if (hasAuditor) {
      // Verify auditor_id is a user with role "auditor"
      auditor = await User.findOne({ _id: auditor_id });
      if (!auditor || auditor.role !== "auditor") {
        return res.status(400).json({ error: "Invalid auditor_id" });
      }
    }

    // Find the product mapping for the given supplier product ID and ensure it belongs to the supplier
    const mapping = await ProductSiteMappings.findOne({
      product_id: supplier_product_id,
      user_id: supplier_id,
    });

    if (!mapping) {
      return res.status(400).json({
        error:
          "supplier_product_id does not belong to the specified supplier in the mapping",
      });
    }

    // Fetch the master product from supplier-master-products
    const masterProduct = await SupplierMasterProducts.findOne({
      _id: mapping.product_id,
    }).lean();

    if (!masterProduct) {
      return res.status(400).json({
        error: "Product not found in master records",
      });
    }
    // Archived requests must not block fresh requests, but in-progress requests still should.
    const existingRequests = await AuditRequestMaster.find({
      create_by_buyer_id,
      supplier_id,
      site_id,
      supplier_product_id: masterProduct._id,
      isArchived: { $ne: true },
    })
      .sort({ updatedAt: -1 })
      .lean();
    const blockingRequest = existingRequests.find(isAuditRequestInProgress);

    if (blockingRequest) {
      const siteDetails = await SupplierSite.findById(site_id).lean();
      const buyerLabel = req.user?.email || "Buyer";
      const supplierLabel = supplier?.email || "Supplier";
      const productLabel = masterProduct?.name || masterProduct?.description || "Product";
      const siteLabel = siteDetails?.site_name || "Site";
      return res.status(409).json({
        error: `An audit request already exists for buyer ${buyerLabel}, supplier ${supplierLabel}, product ${productLabel}, site ${siteLabel}.`,
        existingRequestId: blockingRequest._id,
        existingRequestInternalId: blockingRequest.internalRequestId,
        existingRequestSupplierId: blockingRequest.supplierRequestId,
      });
    }

    const requestedEta = auditETA || complianceDate;
    const compliance = new Date(requestedEta);
    if (!requestedEta || Number.isNaN(compliance.getTime())) {
      return res.status(400).json({ error: "Invalid auditETA" });
    }
    const minComplianceDate = addBusinessDays(new Date(), 7);
    if (compliance < minComplianceDate) {
      return res.status(400).json({
        error: "Compliance date must be at least 7 business days from today.",
      });
    }
    const complianceDay = compliance.getDay();
    if (complianceDay === 0 || complianceDay === 6) {
      return res.status(400).json({
        error: "Compliance date must fall on a weekday.",
      });
    }

    const timeDifferenceInSeconds = moment(requestedEta, "dddd, MMMM Do, YYYY, hh:mm:ss A Z");
    const timeinsec = moment(timeDifferenceInSeconds).diff(moment(), 'seconds') / 9;

    const tenantOrgId = req.tenantId || req.user?.tenant_id || null;
    const artifactChecklist = normalizeArtifactChecklist(req.body?.artifactChecklist);
    const artifactRequiredMap = buildArtifactRequiredMap(artifactChecklist);

    let intimationTemplateId = null;
    const intimationTemplateRaw = req.body?.intimationTemplateId;
    if (intimationTemplateRaw !== undefined && intimationTemplateRaw !== null && String(intimationTemplateRaw).trim()) {
      const numericTemplateId = Number(intimationTemplateRaw);
      if (Number.isNaN(numericTemplateId)) {
        return res.status(400).json({ error: "intimationTemplateId must be numeric" });
      }
      const template = await Template.findOne({ templateId: numericTemplateId }).lean();
      if (!template) {
        return res.status(400).json({ error: "Intimation letter template not found" });
      }
      if (
        (template.templateType && template.templateType !== "INTIMATION_LETTER") &&
        (template.artifactType && template.artifactType !== "INTIMATION_LETTER")
      ) {
        return res.status(400).json({ error: "Selected template is not an intimation letter" });
      }
      intimationTemplateId = numericTemplateId;
    }
    if (!intimationTemplateId) {
      intimationTemplateId = await resolveDefaultTemplateId({
        artifactType: "INTIMATION_LETTER",
        tenantId: tenantOrgId,
        assessmentTypeId: null,
      });
    }

    let preAuditTemplateId = null;
    const preAuditTemplateRaw = req.body?.preAuditTemplateId;
    if (preAuditTemplateRaw !== undefined && preAuditTemplateRaw !== null && String(preAuditTemplateRaw).trim()) {
      const numericTemplateId = Number(preAuditTemplateRaw);
      if (Number.isNaN(numericTemplateId)) {
        return res.status(400).json({ error: "preAuditTemplateId must be numeric" });
      }
      const template = await Template.findOne({ templateId: numericTemplateId }).lean();
      if (!template) {
        return res.status(400).json({ error: "Pre-audit questionnaire template not found" });
      }
      if (
        (template.templateType && template.templateType !== "PRE_AUDIT_Q") &&
        (template.artifactType && template.artifactType !== "PRE_AUDIT_QUESTIONNAIRE")
      ) {
        return res.status(400).json({ error: "Selected template is not a pre-audit questionnaire" });
      }
      preAuditTemplateId = numericTemplateId;
    }
    if (!preAuditTemplateId) {
      preAuditTemplateId = await resolveDefaultTemplateId({
        artifactType: "PRE_AUDIT_QUESTIONNAIRE",
        tenantId: tenantOrgId,
        assessmentTypeId: null,
      });
    }

    // Generate sequential IDs (global and per tenant)
    const internalSeq = await getNextSequence("audit:global");
    const supplierSeq = await resolveSupplierSequence({ tenantOrgId, supplierId: supplier_id });
    const internalRequestId = `HAWK${String(internalSeq).padStart(10, "0")}`;
    const supplierRequestId = `HAWK${String(supplierSeq).padStart(10, "0")}`;

    // Create the audit request, including the new complianceDate field
    const auditorProfile = hasAuditor
      ? await AuditorProfile.findOne({ user_id: auditor_id }).lean()
      : null;
    const assignedAuditors = auditorProfile
      ? [
          {
            auditorProfileId: auditorProfile._id,
            role: "LEAD",
            permissions: [],
            assignedAt: new Date(),
            assignedBy: create_by_buyer_id,
          },
        ]
      : [];

    const auditRequest = new AuditRequestMaster({
      internalRequestId,
      internalSequence: internalSeq,
      supplierRequestId,
      supplierSequence: supplierSeq,
      tenantOrgId,
      supplier_id,
      auditor_id: hasAuditor ? auditor_id : null,
      create_by_buyer_id,
      supplier_product_id: masterProduct._id,
      complianceDate: requestedEta,
      auditETA: requestedEta,
      calendarStartAt: compliance,
      calendarDurationDays: 5,
      calendarEndAt: addCalendarDays(compliance, 5),
      site_id,
      high_status: 1,
      trackStatus: "Request Created (Incomplete)",
      questionnaireStatus: "request_received",
      supplierVisible: false,
      supplierVisibleAt: null,
      supplierVisibleBy: null,
      assignedAuditors,
      artifactChecklist,
      nextAuditOn: hasAuditor ? "auditor" : "buyer",
      requestReviewInProgressEta: moment().add(timeinsec, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      requestReviewCompleteEta: moment().add(timeinsec * 2, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      questionnaireSentEta: moment().add(timeinsec * 3, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      questionnaireReceivedEta: moment().add(timeinsec * 4, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseInProgressEta: moment().add(timeinsec * 5, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseCompleteEta: moment().add(timeinsec * 6, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseReceivedEta: moment().add(timeinsec * 7, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseReviewInProgressEta: moment().add(timeinsec * 8, 'seconds').format('MMMM Do YYYY, h:mm:ss a'),
      responseReviewCompleteEta: moment().add(timeinsec * 9, 'seconds').format('MMMM Do YYYY, h:mm:ss a')
    });
    let saveAttempt = 0;
    while (true) {
      try {
        await auditRequest.save();
        break;
      } catch (saveErr) {
        if (!isSupplierSequenceDuplicate(saveErr) || saveAttempt >= 2) {
          throw saveErr;
        }
        saveAttempt += 1;
        const nextSupplierSeq = await resolveSupplierSequence({ tenantOrgId, supplierId: supplier_id });
        auditRequest.supplierSequence = nextSupplierSeq;
        auditRequest.supplierRequestId = `HAWK${String(nextSupplierSeq).padStart(10, "0")}`;
      }
    }
    let requestIdBundle = null;
    if (ENABLE_NEW_REQUEST_IDS) {
      requestIdBundle = await ensureAuditRequestIds({
        auditRequest,
        buyerTenantId: tenantOrgId,
        supplierTenantId: supplier?.tenant_id || null,
      });
    }
    await syncMilestonesFromStatus({ audit: auditRequest, trackStatus: auditRequest.trackStatus, questionnaireStatus: auditRequest.questionnaireStatus });

    if (intimationTemplateId) {
      const artifactTenantId = tenantOrgId || req.tenantId || null;
      const intimationRequired = isArtifactRequired(artifactRequiredMap, "INTIMATION_LETTER");
      const existingArtifact = await AuditArtifact.findOne({
        tenantId: artifactTenantId,
        auditId: auditRequest._id,
        phaseKey: "INITIATED",
        artifactType: "INTIMATION_LETTER",
      });
      if (existingArtifact) {
        const existingData = buildIntimationArtifactData({
          existingData: existingArtifact.data,
          required: intimationRequired,
        });
        existingArtifact.templateId = intimationTemplateId;
        existingArtifact.ownerRole = "buyer";
        existingArtifact.data = existingData;
        existingArtifact.status = "draft";
        existingArtifact.updatedBy = req.user?._id;
        await existingArtifact.save();
      } else {
        await AuditArtifact.create({
          tenantId: artifactTenantId,
          auditId: auditRequest._id,
          phaseKey: "INITIATED",
          artifactType: "INTIMATION_LETTER",
          ownerRole: "buyer",
          templateId: intimationTemplateId,
          data: buildIntimationArtifactData({ required: intimationRequired }),
          status: "draft",
          createdBy: req.user?._id,
          updatedBy: req.user?._id,
        });
      }
    }

    if (preAuditTemplateId) {
      const artifactTenantId = tenantOrgId || req.tenantId || null;
      const preAuditRequired = isArtifactRequired(artifactRequiredMap, "PRE_AUDIT_QUESTIONNAIRE");
      const existingArtifact = await AuditArtifact.findOne({
        tenantId: artifactTenantId,
        auditId: auditRequest._id,
        phaseKey: "PREP",
        artifactType: "PRE_AUDIT_QUESTIONNAIRE",
      });
      if (existingArtifact) {
        const existingData =
          existingArtifact.data && typeof existingArtifact.data === "object" ? { ...existingArtifact.data } : {};
        const previousIds = Array.isArray(existingData.selectedTemplateIds)
          ? existingData.selectedTemplateIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id))
          : [];
        existingData.selectedTemplateIds = Array.from(new Set([...previousIds, preAuditTemplateId]));
        existingData.required = preAuditRequired;
        existingArtifact.templateId = preAuditTemplateId;
        existingArtifact.ownerRole = "supplier";
        existingArtifact.data = existingData;
        existingArtifact.status = "draft";
        existingArtifact.updatedBy = req.user?._id;
        await existingArtifact.save();
      } else {
        await AuditArtifact.create({
          tenantId: artifactTenantId,
          auditId: auditRequest._id,
          phaseKey: "PREP",
          artifactType: "PRE_AUDIT_QUESTIONNAIRE",
          ownerRole: "supplier",
          templateId: preAuditTemplateId,
          data: { selectedTemplateIds: [preAuditTemplateId], required: preAuditRequired },
          status: "draft",
          createdBy: req.user?._id,
          updatedBy: req.user?._id,
        });
      }
    }

    const [buyerProfile, auditorProfileDetails, supplierProfile, site] = await Promise.all([
      BuyerProfile.findOne({ user_id: create_by_buyer_id }).lean(),
      hasAuditor ? AuditorProfile.findOne({ user_id: auditor_id }).lean() : Promise.resolve(null),
      SupplierProfile.findOne({ user_id: supplier_id }).lean(),
      SupplierSite.findById(site_id).lean(),
    ]);
    const buyerName =
      (buyerProfile ? `${buyerProfile.firstName} ${buyerProfile.lastName}`.trim() : "") ||
      req.user?.email ||
      "Buyer";
    const auditorName =
      (auditorProfileDetails ? `${auditorProfileDetails.firstName} ${auditorProfileDetails.lastName}`.trim() : "") ||
      auditor?.email ||
      "Auditor";
    const supplierName =
      (supplierProfile ? `${supplierProfile.firstName} ${supplierProfile.lastName}`.trim() : "") ||
      supplier?.email ||
      "Supplier";
    const productName = masterProduct?.name || masterProduct?.description || "Product";
    const productIdentifier = masterProduct?.casNumber || masterProduct?.plant_id || masterProduct?._id?.toString();
    const siteName = site?.site_name || "Site";
    const tenantId =
      req.tenantId ||
      req.user?.tenant_id ||
      buyerProfile?.tenant_id ||
      auditor?.tenant_id ||
      auditorProfileDetails?.tenant_id ||
      supplier?.tenant_id ||
      supplierProfile?.tenant_id ||
      site?.tenant_id ||
      null;

    try {
      if (!tenantId) {
        console.warn("[createAuditRequest] Missing tenantId for notification");
      } else {
        const requestLabel = requestIdBundle?.hawkeyeRequestId || resolveAuditRequestLabel(auditRequest);
        if (hasAuditor) {
          const pendingRole = roleLabel("auditor");
          const subject = `New Audit Request \"${requestLabel}\" is assigned to you`;
          const action = { url: `/audits/${auditRequest._id}`, label: "View request" };
          await NotificationOrchestratorService.emitEvent(
            "audit.request.created",
            {
              entityType: "audit",
              entityId: auditRequest._id,
              title: subject,
              message: `Buyer ${buyerName} assigned Audit Request \"${requestLabel}\" for ${supplierName} (${siteName}). Status: ${auditRequest.trackStatus || "Request Created (Incomplete)"} - action pending with \"${pendingRole}\".`,
              action,
              actionRequired: true,
              recipientStrategy: "explicit",
              recipientUserIds: [auditor_id],
              severity: "info",
              metadata: {
                supplierName,
                auditorName,
                productName,
                siteName,
              },
            },
            { tenantId, role: "auditor" }
          );
        }
      }
    } catch (notifyErr) {
      console.error("[createAuditRequest] emitEvent failed", notifyErr.message);
    }

    res.status(201).json({
      message: "Audit request created successfully",
      auditRequest,
      ...(requestIdBundle || {}),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createBuyerProfile = async (req, res) => {
  try {
    // Check if profile already exists for the buyer
    const existingProfile = await BuyerProfile.findOne({
      user_id: req.user._id,
    });
    if (existingProfile) {
      return res.status(400).json({ error: "Profile already exists" });
    }
    const profile = new BuyerProfile({ user_id: req.user._id, ...req.body });
    await profile.save();
    res
      .status(201)
      .json({ message: "Buyer profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateBuyerProfile = async (req, res) => {
  try {
    const profile = await BuyerProfile.findOne({ user_id: req.user._id });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    await BuyerProfile.updateOne({ user_id: req.user._id }, req.body);
    res.status(200).json({ message: "Buyer profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProductsBySupplier = async (req, res) => {
  const { supplier_id, page = 1, limit = 10 } = req.query;
  try {
    if (!supplier_id) {
      return res
        .status(400)
        .json({ error: "supplier_id query parameter is required" });
    }
    const query = { user_id: supplier_id };
    const mappings = await ProductSiteMappings.find(query)
      .populate("user_id")
      .populate("site_id")
      .populate("product_id")
      .populate("apiMasterId")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();
    const siteIds = mappings.map((mapping) => mapping.site_id?._id).filter(Boolean);
    const productIds = mappings.map((mapping) => mapping.product_id?._id).filter(Boolean);
    const supplierObjectId = parseObjId(supplier_id);
    const auditSnapshots =
      supplierObjectId && siteIds.length && productIds.length
        ? await AuditRequestMaster.aggregate([
            {
              $match: {
                supplier_id: supplierObjectId,
                site_id: { $in: siteIds },
                supplier_product_id: { $in: productIds },
              },
            },
            { $sort: { updatedAt: -1 } },
            {
              $group: {
                _id: { site_id: "$site_id", product_id: "$supplier_product_id" },
                audit: { $first: "$$ROOT" },
              },
            },
          ])
        : [];
    const auditMap = new Map(
      auditSnapshots.map((entry) => [
        `${String(entry._id.site_id)}-${String(entry._id.product_id)}`,
        entry.audit,
      ])
    );
    const isCompleted = (audit) => {
      const raw = String(audit?.high_status || audit?.trackStatus || "").toLowerCase();
      if (raw.includes("complete") || raw.includes("closed")) return true;
      const numeric = Number(audit?.high_status);
      return Number.isFinite(numeric) && numeric >= 5;
    };
    const enrichedMappings = mappings.map((mapping) => {
      const siteId = String(mapping.site_id?._id || "");
      const productId = String(mapping.product_id?._id || "");
      const audit = auditMap.get(`${siteId}-${productId}`);
      const completed = isCompleted(audit);
      return {
        ...mapping,
        auditStatus: audit?.trackStatus || audit?.high_status || null,
        lastAuditDate: audit ? (completed ? audit.updatedAt : audit.createdAt) : null,
        complianceStatus: "",
      };
    });
    const totalRecords = await ProductSiteMappings.countDocuments(query);
    res.status(200).json({
      mappings: enrichedMappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSitesBySupplier = async (req, res) => {
  const { supplier_id, page = 1, limit = 10 } = req.query;
  try {
    if (!supplier_id) {
      return res
        .status(400)
        .json({ error: "supplier_id query parameter is required" });
    }
    const query = { user_id: supplier_id };
    const mappings = await SupplierSite.find(query)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await SupplierSite.countDocuments(query);
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getAllAuditors = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const query = { role: "auditor" };
    const auditors = await User.find(query)
      .select("-password -__v")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const totalRecords = await User.countDocuments(query);
    res.status(200).json({
      auditors,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const getSupplierByID = async (req, res) => {
  const { id } = req.params; // supplierProfile._id
  const { page = 1, limit = 10 } = req.query;

  try {
    // Step 1: Fetch supplier profile by _id
    const supplierProfile = await SupplierProfile.findById(id).lean();

    if (!supplierProfile) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Step 1.1: Get user email from User collection
    const user = await User.findOne({ _id: supplierProfile.user_id }).select("email").lean();
    const email = user?.email || null;

    // Add email to supplierProfile
    supplierProfile.email = email;

    // Step 2: Fetch paginated product-site mappings for the supplier's user_id
    const mappings = await ProductSiteMappings.find({ user_id: supplierProfile.user_id })
      .populate("product_id")
      .populate("apiMasterId")
      .populate("site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    if (!mappings.length) {
      return res.status(404).json({ error: "No product mappings found for this supplier" });
    }

    // Step 3: Add supplierProfileInfo (now with email) to each mapping item
    const enrichedMappings = mappings.map(mapping => ({
      ...mapping,
      supplierProfileInfo: supplierProfile,
    }));

    // Step 4: Return response
    res.status(200).json(enrichedMappings);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }




};

export const updateAuditRequest = async (req, res) => {
  const { id } = req.params;
  const {
    complianceDate,
    requestReviewInProgress,
    nextAuditOn,
    trackStatus,
    highStatus,
    isTemplateUsed,
    questionnaireStatus,
    selectedTemplateId
  } = req.body;

  try {
    const auditRequest = await AuditRequestMaster.findById(id);
    if (!auditRequest) {
      return res.status(404).json({ error: 'Audit request not found' });
    }

    const actorRole = normalizeRole(req.user?.role);
    const incomingQuestionnaireStatus = String(questionnaireStatus || "").toLowerCase();
    const isSupplierFinalSubmission =
      actorRole === "supplier" &&
      ["supplier_submitted", "followup_submitted"].includes(incomingQuestionnaireStatus);

    if (isSupplierFinalSubmission) {
      const categories = await AuditQuestions.distinct("categoryName", { auditRequestId: auditRequest._id });
      const normalizedCategories = Array.from(
        new Set(categories.map((category) => String(category || "").trim()).filter(Boolean))
      );
      const assignments = await QuestionnaireSectionAssignment.find({
        auditRequestId: auditRequest._id,
        status: { $ne: "REASSIGNED" },
      })
        .select("categoryName status")
        .lean();
      const statusByCategory = new Map();
      assignments.forEach((assignment) => {
        const category = String(assignment?.categoryName || "").trim();
        if (!category) return;
        const nextStatus = String(assignment?.status || "").toUpperCase();
        const existing = String(statusByCategory.get(category) || "").toUpperCase();
        if (existing === "SUBMITTED") return;
        statusByCategory.set(category, nextStatus);
      });

      const pendingCategories = normalizedCategories.filter(
        (category) => String(statusByCategory.get(category) || "").toUpperCase() !== "SUBMITTED"
      );
      if (pendingCategories.length) {
        return res.status(400).json({
          error: "All questionnaire sections must be submitted before final supplier submission.",
          pendingCategories,
        });
      }
    }

    // Update fields
    if (complianceDate !== undefined) auditRequest.complianceDate = complianceDate;
    if (requestReviewInProgress !== undefined) auditRequest.requestReviewInProgress = requestReviewInProgress;
    if (nextAuditOn !== undefined) auditRequest.nextAuditOn = nextAuditOn;
    if (trackStatus !== undefined) auditRequest.trackStatus = trackStatus;
    if (highStatus !== undefined) auditRequest.high_status = highStatus;
    if (isTemplateUsed !== undefined) auditRequest.isTempleteUsed = isTemplateUsed;
    if (questionnaireStatus !== undefined) auditRequest.questionnaireStatus = questionnaireStatus;
    if (selectedTemplateId !== undefined) auditRequest.selectedTemplateId = selectedTemplateId;

    await auditRequest.save();

    const [auditorUser, supplierUser, product, auditorProfile, supplierProfile] = await Promise.all([
      User.findById(auditRequest.auditor_id).lean(),
      User.findById(auditRequest.supplier_id).lean(),
      SupplierMasterProducts.findById(auditRequest.supplier_product_id).lean(),
      AuditorProfile.findOne({ user_id: auditRequest.auditor_id }).lean(),
      SupplierProfile.findOne({ user_id: auditRequest.supplier_id }).lean(),
    ]);

    const auditorName =
      (auditorProfile ? `${auditorProfile.firstName} ${auditorProfile.lastName}`.trim() : "") ||
      auditorUser?.email ||
      'Auditor';
    const supplierName =
      (supplierProfile ? `${supplierProfile.firstName} ${supplierProfile.lastName}`.trim() : "") ||
      supplierUser?.email ||
      'Supplier';
    const productName = product?.name || product?.description || 'Product';
    const tenantId =
      req.tenantId ||
      req.user?.tenant_id ||
      auditorUser?.tenant_id ||
      supplierUser?.tenant_id ||
      auditorProfile?.tenant_id ||
      supplierProfile?.tenant_id ||
      null;
    const step = questionnaireStatus || trackStatus;
    let requestLabel = resolveAuditRequestLabel(auditRequest);
    if (ENABLE_NEW_REQUEST_IDS && !auditRequest.hawkeyeRequestId) {
      const idBundle = await ensureAuditRequestIds({
        auditRequest,
        buyerTenantId: auditRequest.tenantOrgId || null,
        supplierTenantId: supplierUser?.tenant_id || null,
      });
      requestLabel = idBundle?.hawkeyeRequestId || requestLabel;
    }

    const emitAuditStatusChanged = async ({ title, message, recipientUserIds, recipientRole, action, actionRequired }) => {
      if (!tenantId) {
        console.warn("[updateAuditRequest] Missing tenantId for notification");
        return;
      }
      const recipients = (recipientUserIds || []).filter(Boolean);
      if (!recipients.length) return;
      try {
        const pendingRole = roleLabel(nextAuditOn || recipientRole);
        const statusLabel = step || auditRequest.trackStatus || "Updated";
        const subject = title || `Audit Request \"${requestLabel}\" status changed to \"${statusLabel}\" - action pending with \"${pendingRole}\"`;
        await NotificationOrchestratorService.emitEvent(
          "audit.status.changed",
          {
            entityType: "audit",
            entityId: auditRequest._id,
            title: subject,
            message: message || subject,
            action,
            actionRequired: Boolean(actionRequired),
            recipientStrategy: "explicit",
            recipientUserIds: recipients,
            severity: "info",
            step,
          },
          { tenantId, role: recipientRole }
        );
      } catch (notifyErr) {
        console.error("[updateAuditRequest] emitEvent failed", notifyErr.message);
      }
    };

    // Notification logic, scoped to next action owner
    const normalizedQ = String(questionnaireStatus || "").toLowerCase();
    const normalizedTrack = String(trackStatus || "").toLowerCase();
    const supplierSubmitted =
      ["supplier_submitted", "followup_submitted"].includes(normalizedQ) ||
      normalizedTrack.includes("response complete") ||
      normalizedTrack.includes("followup submitted");
    const questionnaireSent =
      normalizedQ === "sent_to_supplier" || normalizedTrack.includes("questionnaire sent");

    if (supplierSubmitted && nextAuditOn === "auditor" && auditRequest.auditor_id) {
      await emitAuditStatusChanged({
        message: `Supplier ${supplierName} responded for ${productName} (Audit Request \"${requestLabel}\").`,
        recipientUserIds: [auditRequest.auditor_id],
        recipientRole: "auditor",
        action: { url: `/audits/${auditRequest._id}/responses`, label: "Review response" },
        actionRequired: true,
      });
    } else if (questionnaireSent && nextAuditOn === "supplier") {
      // Only notify supplier once the questionnaire is actually sent to them
      await emitAuditStatusChanged({
        message: `Auditor ${auditorName} updated Audit Request \"${requestLabel}\" for ${productName}.`,
        recipientUserIds: [auditRequest.supplier_id],
        recipientRole: "supplier",
        action: { url: `/audits/${auditRequest._id}/report`, label: "View questionnaire" },
        actionRequired: true,
      });
    }

    const notifyFollowupAssignments = async () => {
      if (!tenantId || normalizedQ !== "followup_requested") return;
      const flaggedQuestions = await AuditQuestions.find({
        auditRequestId: auditRequest._id,
        flagStatus: "auditor_flagged",
      })
        .select("categoryName")
        .lean();
      const flaggedCategories = new Set(
        flaggedQuestions.map((q) => q.categoryName).filter(Boolean)
      );
      const assignments = await QuestionnaireSectionAssignment.find({
        auditRequestId: auditRequest._id,
        status: { $ne: "REASSIGNED" },
      })
        .select("categoryName assignedToUserId")
        .lean();
      const recipientMap = new Map();
      assignments.forEach((assignment) => {
        if (!assignment?.assignedToUserId) return;
        if (flaggedCategories.size && !flaggedCategories.has(assignment.categoryName)) return;
        const key = String(assignment.assignedToUserId);
        const existing = recipientMap.get(key) || new Set();
        if (assignment.categoryName) existing.add(assignment.categoryName);
        recipientMap.set(key, existing);
      });

      if (!recipientMap.size && auditRequest.supplier_id) {
        recipientMap.set(String(auditRequest.supplier_id), flaggedCategories.size ? flaggedCategories : new Set());
      }

      for (const [userId, categories] of recipientMap.entries()) {
        const categoryList = Array.from(categories || []);
        const title = `Follow-up needed: ${productName}`;
        const message = categoryList.length
          ? `Follow-up requested for ${categoryList.join(", ")}.`
          : `Follow-up requested for audit ${auditRequest._id}.`;
        try {
          await NotificationOrchestratorService.emitEvent(
            "questionnaire.followup.assigned",
            {
              entityType: "audit",
              entityId: auditRequest._id,
              title,
              message,
              action: { url: `/audits/${auditRequest._id}/report`, label: "Respond to follow-up" },
              recipientStrategy: "explicit",
              recipientUserIds: [userId],
              severity: "warning",
            },
            { tenantId, role: "supplier" }
          );
        } catch (notifyErr) {
          console.error("[updateAuditRequest] followup notify failed", notifyErr.message);
        }
      }
    };

    await notifyFollowupAssignments();

    await syncMilestonesFromStatus({ audit: auditRequest, trackStatus, questionnaireStatus, nextAuditOn });

    return res.status(200).json({
      message: 'Audit request updated successfully',
      auditRequest
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
