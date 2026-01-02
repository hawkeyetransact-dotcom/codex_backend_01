import mongoose from "mongoose";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";


export const getQuestionsByTemplateId = async (req, res) => {
    const { page = 1, limit = 10, type } = req.query;
    const { id } = req.params;

    try {
        const query = { templateId: id };
        const questions = await TemplateQuestions.find(query)
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .lean();
        const totalRecords = await TemplateQuestions.countDocuments(query);

        res.status(200).json({
            questions,
            totalRecords,
            totalPages: Math.ceil(totalRecords / Number(limit)),
            currentPage: Number(page),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};