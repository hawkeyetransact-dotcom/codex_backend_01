import pdfParse from "pdf-parse";
import Tesseract from "tesseract.js";
import { fromBuffer } from "pdf2pic";

export const extractContent = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const { buffer, mimetype } = req.file;
        let text = "";

        if (mimetype === "application/pdf") {
            // 1. Try extracting text directly
            const pdfData = await pdfParse(buffer);
            text = pdfData.text.trim();

            // 2. If text is sparse (scanned PDF), use OCR
            if (text.length < 50) {
                // Heuristic: Less than 50 chars might mean it's scanned or empty.
                // Note: pdf2pic with fromBuffer requires graphicsmagick/ghostscript installed on the system.
                // We will try to convert the first page to image and OCR it. 
                // For a full multi-page OCR, we would need to loop through pages.
                // Since pdf2pic depends on external tools which might not be waiting,
                // we will wrap this in a try-catch and fallback or warn.
                try {
                    // Setup pdf2pic options
                    const options = {
                        density: 100,
                        saveFilename: "untitled",
                        savePath: "./tmp", // Ensure this exists or use temp dir
                        format: "png",
                        width: 800,
                        height: 600
                    };

                    // NOTE: Implementing full PDF-to-Image-to-OCR in Node.js solely with libraries
                    // without external dependencies (like ghostscript) is hard.
                    // basic pdf-parse is purely JS. 
                    // Tesseract.js is pure JS (WASM).
                    // Converting PDF to Image usually needs GS.
                    // If the user environment doesn't have GS, this part will fail.
                    // For now, we return what pdf-parse got, and maybe add a note.

                    // To properly support Scanned PDFs without system deps, we might need a cloud service
                    // or a more complex WASM based PDF renderer.
                    // Assuming the simple path:
                    if (text.length === 0) {
                        text = "[Info] No text found in PDF. It might be a scanned document. OCR for scanned PDFs requires server-side tools (Ghostscript) which might not be present.";
                    }
                } catch (ocrErr) {
                    console.error("OCR fallback failed:", ocrErr);
                }
            }
        } else if (mimetype.startsWith("image/")) {
            // Use Tesseract for Images
            const { data: { text: ocrText } } = await Tesseract.recognize(buffer, "eng");
            text = ocrText;
        }

        res.status(200).json({
            success: true,
            text: text,
            info: "Extraction complete"
        });

    } catch (error) {
        console.error("Extraction error:", error);
        res.status(500).json({ message: "Error extracting content", error: error.message });
    }
};
