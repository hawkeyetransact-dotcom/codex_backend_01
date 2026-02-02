import { fromBuffer } from "pdf2pic";
import fs from "fs";
import { createWorker } from 'tesseract.js';
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";

export const extractOcrTextFromPdfPages = async (pdfBuffer) => {
    fs.mkdirSync("./tmp", { recursive: true });
    const convert = fromBuffer(pdfBuffer, {
        density: 200,
        format: "png",
        saveFilename: "ocr_page",
        savePath: "./tmp"
    });

    const worker = await createWorker("eng");
    const pages = [];
    const images = await convert(1, true); // convert all pages

    let pageIndex = 1;
    for (const image of images) {
        const { data: { text: ocrText } } = await worker.recognize(image.path);
        pages.push({ page: pageIndex, text: ocrText || '' });
        pageIndex += 1;
    }

    await worker.terminate();
    return pages;
};

export const extractOcrTextFromPdf = async (pdfBuffer) => {
    const pages = await extractOcrTextFromPdfPages(pdfBuffer);
    return pages.map((p) => p.text).join('\n').trim();
};

export const splitTextIntoChunks = (text, maxChunkLength = 10000) => {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        let end = start + maxChunkLength;

        // Try to split on a sentence or line boundary
        if (end < text.length) {
            const lastNewline = text.lastIndexOf('\n', end);
            const lastPeriod = text.lastIndexOf('.', end);

            if (lastNewline > start + 1000) end = lastNewline;
            else if (lastPeriod > start + 1000) end = lastPeriod + 1;
        }

        const chunk = text.slice(start, end).trim();
        if (chunk.length > 0) chunks.push(chunk);
        start = end;
    }

    return chunks;
};

export const analyzeTextWithLLM = async (text) => {
    const chunks = splitTextIntoChunks(text, 10000);
    const allObservations = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        console.log(`Analyzing chunk ${i + 1}/${chunks.length}...`);

        const prompt = `
  Extract observations from the following audit report chunk, compare them with ICH Q7 guidelines, and provide corresponding CFR numbers. Return as JSON array with:

  - inspection_id
  - fei_number
  - legal_name
  - inspection_end_date
  - program_area
  - cfr_number
  - short_description
  - long_description

  Chunk ${i + 1}:
  ${chunk}
      `;

        try {
            const analysisRaw = await callLlmService({
                prompt: `You extract audit observations into clean JSON using ICH Q7 and CFR numbers.\n${prompt}`,
                model: process.env.AUDIT_ANALYSIS_MODEL || LLM_MODEL,
                maxTokens: 2048,
                temperature: 0.3
            });

            let analysis = analysisRaw?.trim() || '';

            // Clean and parse JSON
            analysis = analysis.replace(/```json|```/g, '').trim();
            analysis = analysis.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            analysis = analysis.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

            const jsonStart = analysis.indexOf('[') !== -1 ? analysis.indexOf('[') : analysis.indexOf('{');
            const jsonEnd = analysis.lastIndexOf(']') !== -1 ? analysis.lastIndexOf(']') + 1 : analysis.lastIndexOf('}') + 1;

            const chunkObservations = JSON.parse(analysis.slice(jsonStart, jsonEnd));
            if (Array.isArray(chunkObservations)) {
                allObservations.push(...chunkObservations);
            } else {
                allObservations.push(chunkObservations);
            }

        } catch (err) {
            console.error(`Failed on chunk ${i + 1}:`, err.message);
        }
    }

    return allObservations;
};

export const generateAuditQuestions = async (longDescription) => {
    if (!longDescription || longDescription.trim().length < 10) {
      return [{
        question: "Please elaborate on this observation and how your company addresses it.",
      }];
    }

    const prompt = `
  You are a GMP compliance auditor. Based on the following description of a compliance observation, generate 2-3 audit questions that a supplier should answer. Keep the questions clear, concise, and focused on verifying evidence or compliance measures.

  Observation:
  "${longDescription}"

  Return a JSON array of questions like this:
  [
    { "question": "..." },
    { "question": "..." }
  ]
  `;

    try {
      const responseText = await callLlmService({
        prompt,
        model: process.env.AUDIT_QUESTION_MODEL || LLM_MODEL,
        temperature: 0.5,
        maxTokens: 800,
      });

      // Attempt to parse JSON array from response
      const parsed = JSON.parse(responseText || "[]");
      if (Array.isArray(parsed)) return parsed;

      throw new Error("Unexpected response format from LLM");
    } catch (err) {
      console.warn("LLM generation failed:", err.message);
      return [{
        question: "Please describe how your quality system addresses the above issue.",
      }];
    }
  };
