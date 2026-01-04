import path from "path";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import pdfParse from 'pdf-parse';
import { analyzeTextWithOpenAI, extractOcrTextFromPdf, generateAuditQuestions } from "../helpers/aiHelper.js";
import { LabRecords } from "../models/labRecordModels.js";
import { CustomAuditQuestions } from "../models/customAuditQuestionModels.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditorAffiliation } from "../models/auditorAffiliationModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";

export const getAuditRequestsByBuyer = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  try {
    const query = { create_by_buyer_id: req.user._id };
    const requests = await AuditRequestMaster.find(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(); // important for manual modification

    // Enrich supplier_id with supplier_name
    const supplierIds = requests.map(r => r.supplier_id?._id).filter(Boolean);
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: supplierIds } })
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
    res.status(200).json({
      requests,
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
    const supplierIds = requests.map(r => r.supplier_id?._id).filter(Boolean);
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: supplierIds } })
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

    res.status(200).json({
      requests: enrichedRequests,
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
      if (!a?.auditorProfileId) continue;
      assignments.push({
        auditorProfileId: a.auditorProfileId,
        role: a.role || "LEAD",
        permissions: a.permissions || [],
        assignedAt: new Date(),
        assignedBy: req.user?._id,
      });
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
    await audit.save();
    return res.json({ data: audit });
  } catch (err) {
    console.error("assignAuditors error", err);
    return res.status(500).json({ error: "Failed to assign auditors" });
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
    return res.json({
      requests,
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
    const query = { supplier_id: req.user._id };
    const requests = await AuditRequestMaster.find(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(); // important for manual modification

    // Enrich supplier_id with supplier_name
    const supplierIds = requests.map(r => r.supplier_id?._id).filter(Boolean);
    const supplierProfiles = await SupplierProfile.find({ user_id: { $in: supplierIds } })
      .select("user_id firstName")
      .lean();

    const supplierNameMap = {};
    supplierProfiles.forEach(profile => {
      supplierNameMap[profile.user_id.toString()] = profile.firstName;
    });



    const totalRecords = await AuditRequestMaster.countDocuments(query);
    res.status(200).json({
      requests,
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

    if (req.user?.role === "auditor") {
      const ok = await canAuditorAccessAudit(req.user._id, request_id);
      if (!ok) return res.status(403).json({ error: "Forbidden" });
    }

    const query = { _id: request_id };

    const request = await AuditRequestMaster.findOne(query)
      .populate("supplier_id auditor_id create_by_buyer_id supplier_product_id site_id")
      .lean();

    if (!request) {
      return res.status(404).json({ error: "Audit request not found" });
    }

    // --- Enrich SupplierProfile ---
    const supplierId = request?.supplier_id?._id;
    if (supplierId) {
      const supplierProfile = await SupplierProfile.findOne({ user_id: supplierId })
        .select("user_id title firstName lastName companyName addressline1 country state city zipcode")
        .lean();

      if (supplierProfile) {
        request.supplier_id.profile = supplierProfile; // Attach the full profile object
      }
    }

    // --- Enrich BuyerProfile ---
    const buyerId = request?.create_by_buyer_id?._id;
    if (buyerId) {
      const buyerProfile = await BuyerProfile.findOne({ user_id: buyerId })
        .select("user_id title firstName lastName companyName addressline1 country state city zipcode")
        .lean();

      if (buyerProfile) {
        request.create_by_buyer_id.profile = buyerProfile; // Attach the full profile object
      }
    }

    const totalRecords = await AuditRequestMaster.countDocuments(query);

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

    const analysisResults = await analyzeTextWithOpenAI(text);

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

