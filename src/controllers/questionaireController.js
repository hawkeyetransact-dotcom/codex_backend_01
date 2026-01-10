import mongoose from "mongoose";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { loadQuestionnairePreview } from "../services/questionnairePreviewService.js";

export const getQuestionsByTemplateId = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { id } = req.params;

  try {
    const templateId = Number(id);
    if (Number.isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const numericLimit = Number(limit);
    const query = { templateId };
    const cursor = TemplateQuestions.find(query)
      .select("question categoryName subCategoryName templateId categoryId riskcategory Audittype industry Physical createdAt docUrls answerType options helperText subQuestions order responseSchema normalizedQuestion questionCode extractionHints answerMapping")
      .sort({ categoryName: 1, order: 1, createdAt: 1 })
      .lean();

    let questions = [];
    let totalRecords = 0;

    if (numericLimit === 0) {
      [questions, totalRecords] = await Promise.all([
        cursor.exec(),
        TemplateQuestions.countDocuments(query),
      ]);
    } else {
      const skip = (Number(page) - 1) * numericLimit;
      [questions, totalRecords] = await Promise.all([
        cursor.limit(numericLimit).skip(skip).exec(),
        TemplateQuestions.countDocuments(query),
      ]);
    }

    res.status(200).json({
      questions,
      totalRecords,
      totalPages: numericLimit === 0 ? 1 : Math.ceil(totalRecords / numericLimit),
      currentPage: numericLimit === 0 ? 1 : Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getQuestionnairePreviewByTemplateId = async (req, res) => {
  const { id } = req.params;
  const templateId = Number(id);
  if (Number.isNaN(templateId)) {
    return res.status(400).json({ error: "Invalid template id" });
  }
  try {
    const preview = await loadQuestionnairePreview(templateId);
    if (!preview) {
      return res.status(404).json({ error: "Preview template not found" });
    }
    return res.status(200).json(preview);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
