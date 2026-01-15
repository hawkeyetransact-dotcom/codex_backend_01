import { User } from "../models/userModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import moment from "moment";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { getNextSequence } from "../utils/sequenceGenerator.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import { ENABLE_NEW_REQUEST_IDS } from "../config/featureFlags.js";
import { ensureAuditRequestIds } from "../services/requestIdService.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";
import mongoose from "mongoose";

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };

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

  // Request submitted -> reviewer picks it up
  if (statusNorm.includes("request") || qStatus === "request_received") {
    await advanceMilestone({ tenantId, auditId, code: "AR_CREATED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ASSIGNED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_ACCEPTED", desiredStatus: "COMPLETED" });
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

  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed") || nextAuditOn === "auditor") {
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
  const { page = 1, limit = 100 } = req.query;
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.max(Number(limit) || 100, 1);
  try {
    const baseQuery = { role: "auditor", status: "ACTIVE" };
    let auditors = [];
    let countQuery = baseQuery;

    if (req.tenantId) {
      const tenantQuery = { ...baseQuery, tenant_id: req.tenantId };
      auditors = await User.find(tenantQuery)
        .select("-password -__v")
        .limit(normalizedLimit)
        .skip((normalizedPage - 1) * normalizedLimit);
      if (auditors.length) {
        countQuery = tenantQuery;
      }
    }

    if (!auditors.length) {
      auditors = await User.find(baseQuery)
        .select("-password -__v")
        .limit(normalizedLimit)
        .skip((normalizedPage - 1) * normalizedLimit);
      countQuery = baseQuery;
    }

    const auditorIds = auditors.map((a) => a._id);
    const profiles = await AuditorProfile.find({ user_id: { $in: auditorIds } }).lean();
    const profileMap = new Map(profiles.map((p) => [String(p.user_id), p]));
    const enrichedAuditors = auditors.map((auditor) => ({
      ...auditor.toObject?.() ? auditor.toObject() : auditor,
      profile: profileMap.get(String(auditor._id)) || null,
    }));

    const totalRecords = await User.countDocuments(countQuery);
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

  const { supplier_id, auditor_id, supplier_product_id, complianceDate, site_id } =
    req.body;

  const create_by_buyer_id = req.user._id;

  try {
    // Verify supplier_id is a user with role "supplier"
    const supplier = await User.findOne({ _id: supplier_id });
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier_id" });
    }

    // Verify auditor_id is a user with role "auditor"
    const auditor = await User.findOne({ _id: auditor_id });
    if (!auditor || auditor.role !== "auditor") {
      return res.status(400).json({ error: "Invalid auditor_id" });
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
    // Check if an audit request already exists for this combination
    const existingRequest = await AuditRequestMaster.findOne({
      supplier_id,
      site_id,
      supplier_product_id: masterProduct._id,
    });

    if (existingRequest) {
      return res.status(409).json({
        error: "An audit request for this supplier, product, and site already exists.",
        existingRequestId: existingRequest._id,
        existingRequestInternalId: existingRequest.internalRequestId,
        existingRequestSupplierId: existingRequest.supplierRequestId,
      });
    }

    const compliance = new Date(complianceDate);
    if (!complianceDate || Number.isNaN(compliance.getTime())) {
      return res.status(400).json({ error: "Invalid complianceDate" });
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

    const timeDifferenceInSeconds = moment(complianceDate, "dddd, MMMM Do, YYYY, hh:mm:ss A Z");
    const timeinsec = moment(timeDifferenceInSeconds).diff(moment(), 'seconds') / 9;

    const tenantOrgId = req.tenantId || req.user?.tenant_id || null;
    const tenantSequenceKey = `audit:tenant:${tenantOrgId || "global"}`;

    // Generate sequential IDs (global and per tenant)
    const internalSeq = await getNextSequence("audit:global");
    const supplierSeq = await getNextSequence(tenantSequenceKey);
    const internalRequestId = `HAWK${String(internalSeq).padStart(10, "0")}`;
    const supplierRequestId = `HAWK${String(supplierSeq).padStart(10, "0")}`;

    // Create the audit request, including the new complianceDate field
    const auditorProfile = await AuditorProfile.findOne({ user_id: auditor_id }).lean();
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
      auditor_id,
      create_by_buyer_id,
      supplier_product_id: masterProduct._id,
      complianceDate,
      site_id,
      high_status: 1,
      trackStatus: "Request Received",
      questionnaireStatus: "request_received",
      assignedAuditors,
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
    await auditRequest.save();
    let requestIdBundle = null;
    if (ENABLE_NEW_REQUEST_IDS) {
      requestIdBundle = await ensureAuditRequestIds({
        auditRequest,
        buyerTenantId: tenantOrgId,
        supplierTenantId: supplier?.tenant_id || null,
      });
    }
    await syncMilestonesFromStatus({ audit: auditRequest, trackStatus: auditRequest.trackStatus, questionnaireStatus: auditRequest.questionnaireStatus });

    const [buyerProfile, auditorProfileDetails, supplierProfile, site] = await Promise.all([
      BuyerProfile.findOne({ user_id: create_by_buyer_id }).lean(),
      AuditorProfile.findOne({ user_id: auditor_id }).lean(),
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
        const subject = `New Audit Request '${internalRequestId}' has been assigned by '${buyerName}' to audit '${supplierName}' for '${siteName}'`;
        await NotificationOrchestratorService.emitEvent(
          "audit.status.changed",
          {
            entityType: "audit",
            entityId: auditRequest._id,
            title: subject,
            message: subject,
            action: { url: `/audits/${auditRequest._id}/template`, label: "Review request" },
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

    const emitAuditStatusChanged = async ({ title, message, recipientUserIds, recipientRole, action, actionRequired }) => {
      if (!tenantId) {
        console.warn("[updateAuditRequest] Missing tenantId for notification");
        return;
      }
      try {
        await NotificationOrchestratorService.emitEvent(
          "audit.status.changed",
          {
            entityType: "audit",
            entityId: auditRequest._id,
            title,
            message,
            action,
            actionRequired: Boolean(actionRequired),
            recipientStrategy: "explicit",
            recipientUserIds,
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
    if (nextAuditOn === 'auditor') {
      await emitAuditStatusChanged({
        title: `Supplier responded: ${productName}`,
        message: `Supplier ${supplierName} responded for ${productName} (audit ${auditRequest._id}).`,
        recipientUserIds: [auditRequest.auditor_id],
        recipientRole: "auditor",
        action: { url: `/audits/${auditRequest._id}/responses`, label: "Review response" },
        actionRequired: true,
      });
    } else if (nextAuditOn === 'supplier' && questionnaireStatus === 'sent_to_supplier') {
      // Only notify supplier once the questionnaire is actually sent to them
      await emitAuditStatusChanged({
        title: `Audit updated: ${productName}`,
        message: `Auditor ${auditorName} updated the audit request for ${productName} (audit ${auditRequest._id}).`,
        recipientUserIds: [auditRequest.supplier_id],
        recipientRole: "supplier",
        action: { url: `/supplier/audits/${auditRequest._id}/questionnaire`, label: "View questionnaire" },
        actionRequired: true,
      });
    }

    await syncMilestonesFromStatus({ audit: auditRequest, trackStatus, questionnaireStatus, nextAuditOn });

    return res.status(200).json({
      message: 'Audit request updated successfully',
      auditRequest
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
