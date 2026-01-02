import axios from 'axios';
import FormData from 'form-data';
import { TemplateQuestions } from '../models/templateQuestionsModel.js';
import fs from 'fs';

// Proxy to Python AI Service
export const ingestTemplate = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: false, message: 'No file uploaded' });
        }

        const form = new FormData();
        form.append('file', fs.createReadStream(req.file.path), req.file.originalname);

        // Call Python Microservice
        const aiServiceUrl = 'http://127.0.0.1:8000/ingest-template';
        const response = await axios.post(aiServiceUrl, form, {
            headers: {
                ...form.getHeaders(),
            },
        });

        // Cleanup uploaded file
        fs.unlinkSync(req.file.path);

        if (response.data && response.data.questions) {
            return res.status(200).json({ status: true, data: response.data.questions });
        } else {
            return res.status(500).json({ status: false, message: 'AI Service returned invalid data' });
        }

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error('Ingest Error:', error.message);
        return res.status(500).json({ status: false, message: error.message });
    }
};

// Save Finalized Template
export const createTemplate = async (req, res) => {
    try {
        const { questions, templateName } = req.body;

        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ status: false, message: 'Invalid questions data' });
        }

        // Determine new Template ID (simple auto-increment logic or use Timestamp)
        // For now, let's find the max templateId and add 1
        const lastQ = await TemplateQuestions.findOne().sort({ templateId: -1 });
        const newTemplateId = (lastQ && lastQ.templateId) ? lastQ.templateId + 1 : 1001;

        // Use bulkWrite for performance or map inserts
        const questionDocs = questions.map(q => ({
            question: q.question,
            categoryName: q.category || 'General',
            templateId: newTemplateId,
            categoryId: q.categoryId, // Frontend should provide mapped ID or we default
            riskcategory: q.risk_level || 'Medium',
            Audittype: 'Standard',
            industry: 'General',
            Physical: 'N'
        }));

        // Note: 'categoryId' is an ObjectId ref. 
        // If the AI guesses a category name, we need to map it to an existing ID or create one.
        // For MVP, allow frontend to pass a default categoryId or handle mapping there.
        // Assuming frontend selects a "Target Category" or maps each row.

        // Simplification: We need valid ObjectIds for categoryId.
        // Let's assume the frontend sends valid categoryIds for each row.

        await TemplateQuestions.insertMany(questionDocs);

        return res.status(201).json({ status: true, message: 'Template created successfully', templateId: newTemplateId });

    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};
