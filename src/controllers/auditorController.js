import mongoose from "mongoose";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";

export const createProfile = async (req, res) => {
  try {
    const existingProfile = await AuditorProfile.findOne({
      user_id: req.user._id,
    });
    if (existingProfile)
      return res
        .status(400)
        .json({ error: "Profile already exists.", profile: existingProfile });

    const profile = new AuditorProfile({ user_id: req.user._id, ...req.body });
    await profile.save();

    res.status(201).json({ message: "Profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const profile = await AuditorProfile.findOne({ user_id: req.user._id });

    if (!profile) return res.status(404).json({ error: "Profile not found." });

    await AuditorProfile.updateOne({ user_id: req.user._id }, req.body);

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPreviewAuditQuestions = async (req, res) => {
  const { auditRequestId, questions, templateId } = req.body;
  const ExistingAudit = await AuditRequestMaster.findById(auditRequestId);
  if (!ExistingAudit) {
    return res
      .status(403)
      .json({ error: "Audit request does not exist." });
  }
  await AuditQuestions.updateMany(
    { auditRequestId },
    { $set: { isTempDeleted: true } }
  );
  const bulkOperations = questions.map((q) => ({
    updateOne: {
      filter: { question_id: q.question_id, auditRequestId },  // Check if exists
      update: {
        $set: {
          question: q.question,
          categoryName: q.categoryName,
          templateId: q.templateId,
          categoryId: q.categoryId,
          isTempDeleted: false  // Reactivate if previously deleted
        }
      },
      upsert: true  // Insert if not found
    }
  }));

  // Perform bulk write
  const bulkResult = await AuditQuestions.bulkWrite(bulkOperations);

  // Mark questionnaire as in progress as soon as a draft is saved
  await AuditRequestMaster.findByIdAndUpdate(auditRequestId, {
    $set: {
      questionnaireStatus: "in_progress",
      trackStatus: "Questionnaire in progress",
      isTempleteUsed: true,
      ...(templateId ? { selectedTemplateId: templateId } : {})
    }
  });

  res.status(200).json({
    resCode: 200,
    message: "Audit questions processed successfully.",
    bulkResult
  });
}

export const getAuditoQuestionsByRequestId = async (req, res) => {
  const { auditRequestId, page = 1, limit = 10 } = req.query;
  try {
    if (!auditRequestId) {
      return res
        .status(400)
        .json({ error: "request Id query parameter is required" });
    }
    const query = { auditRequestId: auditRequestId };
    const mappings = await AuditQuestions.find(query)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalRecords = await AuditQuestions.countDocuments(query);
    res.status(200).json({
      mappings,
      totalRecords,
      totalPages: Math.ceil(totalRecords / Number(limit)),
      currentPage: Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export const updateAuditResponses = async (req, res) => {
  const { responses, status } = req.body;
  const { auditRequestId } = req.params;

  try {
    // Check if Audit Request exists
    const existingAudit = await AuditRequestMaster.findById(auditRequestId);
    if (!existingAudit) {
      return res.status(403).json({ error: "Audit request does not exist." });
    }

    // Fetch existing audit questions for this request
    const existingQuestions = await AuditQuestions.find({ auditRequestId });

    // Map existing data for quick access
    const existingMap = {};
    for (const doc of existingQuestions) {
      existingMap[doc._id.toString()] = doc;
    }


    const bulkOperations = Object.entries(responses).map(([questionId, response]) => {
      const existing = existingMap[questionId] || {};

      return {
        updateOne: {
          filter: {
            _id: new mongoose.Types.ObjectId(String(questionId)),
            auditRequestId: new mongoose.Types.ObjectId(String(auditRequestId))
          },
          update: {
            $set: {
              YesNoAnswers: response.YesNoAnswers ?? existing.YesNoAnswers ?? null,
              textResponse: response.textResponse ?? existing.textResponse ?? null,
              docUrls: response.docUrls ?? existing.docUrls ?? '',
              internalNotes: response.internalNotes ?? existing.internalNotes ?? null,
              isComplient: typeof response.isComplient === 'boolean' ? response.isComplient : existing.isComplient ?? null,
              flagStatus: response.flagStatus ?? existing.flagStatus ?? 'auditor_accepted',
              messages: response.messages ?? existing.messages ?? '',
              PhysicalAuditRequired: typeof response.PhysicalAuditRequired === 'boolean'
                ? response.PhysicalAuditRequired
                : existing.PhysicalAuditRequired ?? false,
              responseStatus: status,
              updatedAt: new Date()
            }
          },
          upsert: false
        }
      };
    });

    const bulkResult = await AuditQuestions.bulkWrite(bulkOperations);

    return res.status(200).json({
      resCode: 200,
      message: "Audit questions updated successfully.",
      bulkResult
    });

  } catch (error) {
    console.error('Error updating audit responses:', error);
    return res.status(500).json({ error: error.message });
  }
};





