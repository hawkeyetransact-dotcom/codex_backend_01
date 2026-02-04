import path from "path";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { User } from "../models/userModel.js";
import pdfParse from 'pdf-parse';
import { analyzeTextWithLLM, extractOcrTextFromPdf, generateAuditQuestions } from "../helpers/aiHelper.js";
import { LabRecords } from "../models/labRecordModels.js";
import { CustomAuditQuestions } from "../models/customAuditQuestionModels.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditorAffiliation } from "../models/auditorAffiliationModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { ENABLE_NEW_REQUEST_IDS } from "../config/featureFlags.js";
import { attachAliasesToRequests, resolveAuditRequestId } from "../services/requestIdService.js";
import { derivePhaseStateFromLegacy, normalizePhaseState } from "../services/auditPhaseService.js";

const applyPhaseState = (request) => {
  if (!request) return request;
  const phaseState = normalizePhaseState(request.phaseState || derivePhaseStateFromLegacy(request));
  return { ...request, phaseState };
};

const applyPhaseStates = (requests = []) => requests.map(applyPhaseState);

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

export const getAuditRequestsByBuyer = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const role = req.user?.role;
    let query = { create_by_buyer_id: req.user._id };
    if (req.adminScope === "PLATFORM" || role === "superadmin") {
      query = {};
    } else if (role === "tenant_admin" || role === "admin") {
      const tenantId = req.tenantId || req.user?.tenant_id || null;
      query = tenantId ? { tenantOrgId: tenantId } : {};
    }
    const requests = await AuditRequestMaster.find(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(); // important for manual modification

    // Enrich supplier_id with supplier_name
    const requestSupplierIds = requests.map(r => r.supplier_id?._id).filter(Boolean);
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: requestSupplierIds } })
      .select("user_id firstName")
      .lean();

    const supplierNameMap = {};
    supplierProfiles.forEach(profile => {
      supplierNameMap[profile.user_id.toString()] = profile.firstName;
    });

    const enrichedRequests = requests.map(request => {
      const supplier = request.supplier_id;
      if (supplier && supplier._id) {
        const supplierIdStr = supplier._id.toString();
        request.supplier_id.firstName = supplierNameMap[supplierIdStr] || "";
      }
      return request;
    });

    const totalRecords = await AuditRequestMaster.countDocuments(query);
    const finalRequests = ENABLE_NEW_REQUEST_IDS ? await attachAliasesToRequests(requests) : requests;
    const phaseRequests = applyPhaseStates(finalRequests);
    res.status(200).json({
      requests: phaseRequests,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAuditRequestsByAuditor = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const profile = await AuditorProfile.findOne({ user_id: req.user._id }).lean();
    const profileId = profile?._id;

    const query = {
      $or: [
        { auditor_id: req.user._id },
        profileId ? { "assignedAuditors.auditorProfileId": profileId } : null,
      ].filter(Boolean),
    };

    const requests = await AuditRequestMaster.find(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(); // important for manual modification

    // Enrich supplier_id with supplier_name
    const requestSupplierIds = requests.map(r => r.supplier_id?._id).filter(Boolean);
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: requestSupplierIds } })
      .select("user_id firstName")
      .lean();

    const supplierNameMap = {};
    supplierProfiles.forEach(profile => {
      supplierNameMap[profile.user_id.toString()] = profile.firstName;
    });

    const enrichedRequests = requests.map(request => {
      const supplier = request.supplier_id;
      if (supplier && supplier._id) {
        const supplierIdStr = supplier._id.toString();
        request.supplier_id.firstName = supplierNameMap[supplierIdStr] || "";
      }
      return request;
    });

    const totalRecords = await AuditRequestMaster.countDocuments(query);

    const finalRequests = ENABLE_NEW_REQUEST_IDS ? await attachAliasesToRequests(enrichedRequests) : enrichedRequests;
    const phaseRequests = applyPhaseStates(finalRequests);
    res.status(200).json({
      requests: phaseRequests,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const assignAuditors = async (req, res) => {
  const { id } = req.params;
  const { auditors = [] } = req.body || {};
  try {
    const audit = await AuditRequestMaster.findById(id);
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    const assignments = [];
    for (const a of auditors) {
      let profileId = a?.auditorProfileId || null;
      if (!profileId && a?.auditorUserId) {
        const profile = await AuditorProfile.findOne({ user_id: a.auditorUserId }).lean();
        profileId = profile?._id || null;
      }
      if (!profileId) continue;
      assignments.push({
        auditorProfileId: profileId,
        role: a.role || "LEAD",
        permissions: a.permissions || [],
        assignedAt: new Date(),
        assignedBy: req.user?._id,
      });
    }
    if (!assignments.length) {
      return res.status(400).json({ error: "No valid auditors were provided for assignment" });
    }
    // Dual-write: keep legacy field if a lead provided
    const lead = assignments.find((x) => x.role === "LEAD") || assignments[0];
    if (lead) {
      const prof = await AuditorProfile.findById(lead.auditorProfileId).lean();
      if (prof?.user_id) {
        audit.auditor_id = prof.user_id;
      }
    }
    audit.assignedAuditors = assignments;
    if (audit.auditor_id) {
      audit.auditorDecision = "PENDING";
      audit.auditorDecisionAt = null;
      audit.auditorRejectionReason = null;
      audit.nextAuditOn = "auditor";
      audit.trackStatus = "Auditor selected";
    }
    await audit.save();

    const tenantId = await resolveAuditWorkflowTenantId({
      auditId: audit._id,
      fallbackTenantId: audit?.tenantOrgId || audit?.tenant_id || null,
    });
    if (tenantId && audit.auditor_id) {
      await ensureWorkflowRecord(tenantId, audit._id, "AR_AUDITOR_ASSIGNED");
      await ensureWorkflowRecord(tenantId, audit._id, "AR_AUDITOR_ACCEPTANCE_PENDING");
      await WorkflowMilestoneService.markMilestoneCompleted(audit._id, "AR_AUDITOR_ASSIGNED", {
        tenantId,
        role: "system",
      });
      await WorkflowMilestoneService.markMilestoneStarted(audit._id, "AR_AUDITOR_ACCEPTANCE_PENDING", {
        tenantId,
        role: "system",
      });
    }

    if (tenantId && audit.auditor_id) {
      const [buyerProfile, supplierProfile, site, auditorUser, auditorProfile] = await Promise.all([
        BuyerProfile.findOne({ user_id: audit.create_by_buyer_id }).lean(),
        SupplierProfile.findOne({ user_id: audit.supplier_id }).lean(),
        SupplierSite.findById(audit.site_id).lean(),
        User.findById(audit.auditor_id).lean(),
        AuditorProfile.findOne({ user_id: audit.auditor_id }).lean(),
      ]);
      const buyerName =
        (buyerProfile ? `${buyerProfile.firstName} ${buyerProfile.lastName}`.trim() : "") ||
        "Buyer";
      const supplierName =
        (supplierProfile ? `${supplierProfile.firstName} ${supplierProfile.lastName}`.trim() : "") ||
        "Supplier";
      const auditorName =
        (auditorProfile ? `${auditorProfile.firstName} ${auditorProfile.lastName}`.trim() : "") ||
        auditorUser?.email ||
        "Auditor";
      const siteName = site?.site_name || "Site";
      const requestLabel = audit.internalRequestId || audit.hawkeyeRequestId || audit.supplierRequestId || audit._id;
      const subject = `Audit ID: ${requestLabel} is assigned to you`;
      await NotificationOrchestratorService.emitEvent(
        "audit.request.assigned",
        {
          entityType: "audit",
          entityId: audit._id,
          title: subject,
          message: `Buyer ${buyerName} assigned an audit for ${supplierName} (${siteName}).`,
          action: { url: `/audits/${audit._id}`, label: "View request" },
          actionRequired: true,
          recipientStrategy: "explicit",
          recipientUserIds: [audit.auditor_id],
          severity: "info",
        },
        { tenantId, role: "auditor" }
      );
    }
    return res.json({ data: audit });
  } catch (err) {
    console.error("assignAuditors error", err);
    return res.status(500).json({ error: "Failed to assign auditors" });
  }
};

export const updateSupplierDecision = async (req, res) => {
  const { id } = req.params;
  const { decision, reason } = req.body || {};
  try {
    const normalized = String(decision || "").toUpperCase();
    if (!["ACCEPTED", "REJECTED"].includes(normalized)) {
      return res.status(400).json({ error: "decision must be ACCEPTED or REJECTED" });
    }
    const audit = await AuditRequestMaster.findById(id);
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    const role = req.user?.role;
    const userId = String(req.user?._id || "");
    const supplierId = String(audit?.supplier_id || "");
    const supplierUser = await User.findById(audit?.supplier_id).lean();
    const supplierTenantId = String(supplierUser?.tenant_id || "");
    const tenantId = String(req.tenantId || req.user?.tenant_id || "");

    if (role === "supplier" && supplierId && supplierId !== userId) {
      if (!tenantId || !supplierTenantId || supplierTenantId !== tenantId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    if (role === "supplierUser") {
      const ownerId = String(req.user?.invitedBy || "");
      if (!ownerId || (supplierId && supplierId !== ownerId)) {
        if (!tenantId || !supplierTenantId || supplierTenantId !== tenantId) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
    }

    audit.supplierDecision = normalized;
    audit.supplierDecisionAt = new Date();
    audit.supplierDecisionBy = req.user?._id || null;
    audit.supplierRejectionReason = normalized === "REJECTED" ? reason || "Supplier rejected" : null;
    audit.trackStatus = normalized === "ACCEPTED" ? "Audit intimation accepted" : "Audit intimation rejected";
    audit.nextAuditOn = normalized === "ACCEPTED" ? "supplier" : "buyer";
    await audit.save();

    const notifyTenantId = audit.tenantOrgId || req.tenantId || null;
    if (notifyTenantId && audit.create_by_buyer_id) {
      const buyerProfile = await BuyerProfile.findOne({ user_id: audit.create_by_buyer_id }).lean();
      const buyerName =
        (buyerProfile ? `${buyerProfile.firstName} ${buyerProfile.lastName}`.trim() : "") ||
        "Buyer";
      const subject =
        normalized === "ACCEPTED"
          ? `Supplier accepted audit request`
          : `Supplier rejected audit request`;
      const message =
        normalized === "ACCEPTED"
          ? `Supplier accepted the audit request.`
          : `Supplier rejected the audit request${reason ? `: ${reason}` : ""}.`;
      await NotificationOrchestratorService.emitEvent(
        "audit.supplier.decision",
        {
          entityType: "audit",
          entityId: audit._id,
          title: subject,
          message,
          action: { url: `/audits/${audit._id}`, label: "View audit" },
          recipientStrategy: "explicit",
          recipientUserIds: [audit.create_by_buyer_id],
          severity: normalized === "ACCEPTED" ? "info" : "warning",
        },
        { tenantId: notifyTenantId, role: "buyer" }
      );
    }

    return res.json({ success: true, data: audit });
  } catch (err) {
    console.error("updateSupplierDecision error", err);
    return res.status(500).json({ error: "Failed to update supplier decision" });
  }
};

export const getMyAudits = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const profile = await AuditorProfile.findOne({ user_id: req.user._id }).lean();
    const profileId = profile?._id;
    if (!profileId) return res.json({ requests: [], totalRecords: 0, totalPages: 0, currentPage: Number(page) });

    const assignments = await AuditorAffiliation.find({
      auditorProfileId: profileId,
      status: "ACTIVE",
    })
      .select("orgTenantId")
      .lean();
    const allowedTenants = new Set(assignments.map((a) => String(a.orgTenantId || "")));

    const query = {
      $and: [
        {
          $or: [
            { auditor_id: req.user._id },
            { "assignedAuditors.auditorProfileId": profileId },
          ],
        },
        allowedTenants.size ? { tenantOrgId: { $in: Array.from(allowedTenants) } } : {},
      ].filter(Boolean),
    };

    const requests = await AuditRequestMaster.find(query)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();
    const totalRecords = await AuditRequestMaster.countDocuments(query);
    const finalRequests = ENABLE_NEW_REQUEST_IDS ? await attachAliasesToRequests(requests) : requests;
    const phaseRequests = applyPhaseStates(finalRequests);
    return res.json({
      requests: phaseRequests,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    console.error("getMyAudits error", error);
    return res.status(500).json({ error: "Failed to fetch audits" });
  }
};

export const getAuditRequestsBySupplier = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const role = req.user?.role;
    const ownerId =
      role === "supplierUser" && req.user?.invitedBy
        ? req.user.invitedBy
        : req.user._id;
    let supplierIds = [ownerId];
    if (role === "supplier" && req.user?.tenant_id) {
      const tenantSuppliers = await User.find({
        tenant_id: req.user.tenant_id,
        role: "supplier",
      })
        .select("_id")
        .lean();
      supplierIds = tenantSuppliers.map((u) => u._id);
      if (!supplierIds.length) supplierIds = [ownerId];
    }
    const query = supplierIds.length > 1 ? { supplier_id: { $in: supplierIds } } : { supplier_id: ownerId };
    const requests = await AuditRequestMaster.find(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(); // important for manual modification

    // Enrich supplier_id with supplier_name
    const requestSupplierIds = requests.map((r) => r.supplier_id?._id).filter(Boolean);
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: requestSupplierIds } })
      .select("user_id firstName")
      .lean();

    const supplierNameMap = {};
    supplierProfiles.forEach(profile => {
      supplierNameMap[profile.user_id.toString()] = profile.firstName;
    });



    const totalRecords = await AuditRequestMaster.countDocuments(query);
    const finalRequests = ENABLE_NEW_REQUEST_IDS ? await attachAliasesToRequests(requests) : requests;
    const phaseRequests = applyPhaseStates(finalRequests);
    res.status(200).json({
      requests: phaseRequests,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const getAuditRequestSingleAudit = async (req, res) => {
  const { request_id, page = 1, limit = 10 } = req.query;

  try {
    if (!request_id) {
      return res.status(400).json({ error: "request_id query parameter is required" });
    }

    let resolvedRequestId = request_id;
    if (ENABLE_NEW_REQUEST_IDS) {
      resolvedRequestId = await resolveAuditRequestId({ requestId: request_id, AuditRequestModel: AuditRequestMaster });
      if (!resolvedRequestId) {
        return res.status(404).json({ error: "Audit request not found" });
      }
    }

    if (req.user?.role === "auditor") {
      const ok = await canAuditorAccessAudit(req.user._id, resolvedRequestId);
      if (!ok) return res.status(403).json({ error: "Forbidden" });
    }

    const query = { _id: resolvedRequestId };

    let request = await AuditRequestMaster.findOne(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .lean();

    if (!request) {
      return res.status(404).json({ error: "Audit request not found" });
    }

    const role = req.user?.role;
    const userId = String(req.user?._id || "");
    const supplierId = String(request?.supplier_id?._id || request?.supplier_id || "");
    const buyerId = String(request?.create_by_buyer_id?._id || request?.create_by_buyer_id || "");
    const tenantId = String(req.tenantId || req.user?.tenant_id || "");
    const requestTenantId = String(request?.tenantOrgId || "");
    const supplierTenantId = String(request?.supplier_id?.tenant_id || "");

    if (role === "supplier" && supplierId && supplierId !== userId) {
      if (!tenantId || !supplierTenantId || supplierTenantId !== tenantId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    if (role === "supplierUser") {
      const ownerId = String(req.user?.invitedBy || "");
      if (!ownerId || (supplierId && supplierId !== ownerId)) {
        if (!tenantId || !supplierTenantId || supplierTenantId !== tenantId) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
    }

    if (role === "buyer" && buyerId && buyerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (["tenant_admin", "admin"].includes(role) && tenantId && requestTenantId && requestTenantId !== tenantId) {
      return res.status(404).json({ error: "Audit request not found" });
    }

    // --- Enrich SupplierProfile ---
    const supplierUserId = request?.supplier_id?._id;
    if (supplierUserId) {
      const supplierProfile = await SupplierProfile.findOne({ user_id: supplierUserId })
        .select("user_id title firstName lastName companyName addressline1 country state city zipcode panNumber gstNumber caNumber")
        .lean();

      if (supplierProfile) {
        request.supplier_id.profile = supplierProfile; // Attach the full profile object
      }
    }

    // --- Enrich BuyerProfile ---
    const buyerUserId = request?.create_by_buyer_id?._id;
    if (buyerUserId) {
      const buyerProfile = await BuyerProfile.findOne({ user_id: buyerUserId })
        .select("user_id title firstName lastName companyName addressline1 country state city zipcode")
        .lean();

      if (buyerProfile) {
        request.create_by_buyer_id.profile = buyerProfile; // Attach the full profile object
      }
    }

    const totalRecords = await AuditRequestMaster.countDocuments(query);

    if (ENABLE_NEW_REQUEST_IDS) {
      const enriched = await attachAliasesToRequests([request]);
      if (enriched[0]) request = enriched[0];
    }
    request = applyPhaseState(request);
    res.status(200).json({
      requests: request,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const uploadPastAuditData = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Unauthorized: Supplier not identified" });
    }
    const supplierId = req.user._id;

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const fileBuffer = file?.buffer;

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      return res.status(400).json({ error: "Invalid or empty file buffer" });
    }

    let text = "";
    if (ext === ".pdf") {
      try {
        const data = await pdfParse(fileBuffer);
        text = data.text?.trim() || await extractOcrTextFromPdf(fileBuffer);
      } catch (err) {
        console.warn("PDF parsing failed, using OCR:", err.message);
        text = await extractOcrTextFromPdf(fileBuffer);
      }
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    if (!text.trim()) return res.status(200).json({ message: "No text found." });

    const analysisResults = await analyzeTextWithLLM(text);

    // Respond immediately to frontend
    res.status(202).json({ message: "Upload received. Processing in background." });

    // Background processing
    setImmediate(async () => {
      try {
        const auditQuestions = [];

        for (const observation of analysisResults) {
          const { inspection_id, short_description, long_description } = observation;

          const exists = await LabRecords.findOne({
            supplier_id: supplierId,
            inspectionId: inspection_id,
            short_description,
          });

          if (exists) {
            console.log(`Skipping duplicate: ${inspection_id} - ${short_description}`);
            continue;
          }

          const record = await LabRecords.create({
            supplier_id: supplierId,
            inspectionId: inspection_id || null,
            feinumber: observation.fei_number || null,
            legal_name: observation.legal_name || null,
            inspection_end_date: observation.inspection_end_date || null,
            program_area: observation.program_area || null,
            cfr_number: observation.cfr_number || null,
            short_description: short_description || null,
            long_description: long_description || null,
            type: observation.type || "Past Observation",
            FDA_observation_category: observation.FDA_observation_category || null,
            processingStatus: "processing",
          });

          let observationData = [];
          try {
            observationData = await generateAuditQuestions(long_description || "");
            if (!Array.isArray(observationData)) throw new Error("Invalid question format");
          } catch (err) {
            console.warn("generateAuditQuestions failed, using fallback:", err.message);
            observationData = [{
              question: "Please describe the issue related to the observation in your facility.",
            }];
          }

          const mappedQuestions = observationData.map((question) => ({
            question,
            id: inspection_id || "N/A",
            recordId: record._id,
          }));

          auditQuestions.push(...mappedQuestions);

          await LabRecords.findByIdAndUpdate(record._id, {
            processingStatus: mappedQuestions.length > 0 ? "completed" : "failed",
          });
        }

        // De-duplicate questions
        const uniqueQuestions = [];
        const questionSet = new Set();

        for (const aq of auditQuestions) {
          const key = `${aq.id}-${aq.question.question || aq.question}`;
          if (!questionSet.has(key)) {
            questionSet.add(key);
            uniqueQuestions.push(aq);
          }
        }

        for (const auditQuestion of uniqueQuestions) {
          try {
            const exists = await CustomAuditQuestions.findOne({
              observationId: auditQuestion.id,
              question: auditQuestion.question.question || auditQuestion.question,
              supplier_id: supplierId,
            });

            if (exists) {
              console.info("Skipping duplicate question:", auditQuestion.id);
              continue;
            }

            const newAudit = await CustomAuditQuestions.create({
              observationId: auditQuestion.id,
              question: auditQuestion.question.question || auditQuestion.question,
              categoryName: "custom",
              supplier_id: supplierId,
              processingStatus: "processing",
            });

            await CustomAuditQuestions.findByIdAndUpdate(newAudit._id, {
              processingStatus: "completed",
            });
          } catch (err) {
            console.warn("Failed to save audit question:", auditQuestion.id, err.message);
            await CustomAuditQuestions.updateOne({
              observationId: auditQuestion.id,
              question: auditQuestion.question.question || auditQuestion.question,
              supplier_id: supplierId,
            }, {
              $set: { processingStatus: "failed" },
            });
          }
        }

        console.log(`[Audit Processing] Completed for supplier ${supplierId}. Added ${uniqueQuestions.length} questions.`);
      } catch (bgErr) {
        console.error("Fatal background error:", bgErr.message);
      }
    });

  } catch (error) {
    console.error("Error processing audit upload:", error);
    return res.status(500).json({ error: "Internal server error: " + error.message });
  }
};


export const getPastAuditQuestions = async (req, res) => {
  try {
    const { supplier_id, page = 1, limit = 10 } = req.query;

    if (!supplier_id) {
      return res.status(400).json({ status: false, message: "supplier_id query parameter is required" });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [questions, total] = await Promise.all([
      CustomAuditQuestions.find({ supplier_id })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      CustomAuditQuestions.countDocuments({ supplier_id }),
    ]);

    return res.status(200).json({
      status: true,
      data: {
        questions,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error("Error fetching past audit questions:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
  }
};

export const getAuditProcessingStatus = async (req, res) => {
  try {

    const { supplier_id } = req.query;
    if (!supplier_id) {
      return res.status(400).json({ status: false, message: "supplier_id query parameter is required" });
    }
    const labRecords = await LabRecords.find({ supplier_id: supplier_id }).select('inspectionId processingStatus');
    const customQuestions = await CustomAuditQuestions.find({ supplier_id: supplier_id }).select('observationId processingStatus');

    return res.status(200).json({
      labRecords,
      customQuestions
    });

  } catch (err) {
    console.error("Error fetching processing status:", err);
    return res.status(500).json({ error: "Internal server error: " + err.message });
  }
};
