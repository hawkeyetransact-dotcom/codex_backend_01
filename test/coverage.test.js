import assert from "assert";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { connectDatabase } from "../src/config/database.js";
import { DocIntelService } from "../src/services/docIntelService.js";
import EvidenceUpload from "../src/models/evidenceUploadModel.js";
import EvidencePage from "../src/models/evidencePageModel.js";

const findTemplatePath = () => {
  const candidates = [
    process.env.PSCI_TEMPLATE_PATH,
    path.join(
      process.cwd(),
      "uploads",
      "1765409212052-Full_PSCI_SAQ_&_Audit_Report_Template_for_Core_Suppliers,_External_Manufacturers,_Component_and_Material_Suppliers_(WORD_VERSION)_(1).docx"
    ),
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error("PSCI template DOCX not found for coverage test");
  return hit;
};

const createSamplePdfBuffer = async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const text = [
    "The facility maintains ethics, labor, environment, health and safety certifications including ISO 14001 and OHSAS 18001.",
    "Supplier approval and CAPA processes are documented with management review.",
    "Training records show majority of employees speak English at this location.",
  ].join(" ");
  page.drawText(text, { x: 50, y: 700, size: 12, font, lineHeight: 16 });
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.log("Skipping coverage tests because MONGO_URI is not set.");
    return;
  }

  await connectDatabase();

  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const templateDocxPath = findTemplatePath();

  const questions = await DocIntelService.parseSaqQuestions(templateDocxPath);
  assert.ok(questions.length >= 80, "should parse at least 80 questions");
  const qnums = questions.map((q) => q.qnum);
  assert.ok(qnums.includes(1) && qnums.includes(98), "should include qnum 1 and 98");

  const buffer = await createSamplePdfBuffer();
  const auditRequestId = new mongoose.Types.ObjectId();

  const ingest = await DocIntelService.ingestPdf({
    file: { buffer, mimetype: "application/pdf", originalname: "coverage-test.pdf", size: buffer.length },
    tenantId,
    uploaderId: userId,
    auditRequestId,
  });
  assert.ok(ingest.pagesStored > 0, "ingest should store at least one page");

  await EvidencePage.create({
    tenantId,
    uploadId: ingest.upload._id,
    auditRequestId,
    fileName: "coverage-test.pdf",
    fileSha256: ingest.upload.fileSha256,
    mime: "application/pdf",
    pageNumber: ingest.upload.pageCount + 1,
    text: "Facility ethics labor environment health safety management system ISO 14001 OHSAS 18001 supplier approval CAPA corrective preventive action.",
  });

  const coverage = await DocIntelService.computeCoverage({ tenantId, questions, topN: 3, auditRequestId });
  assert.equal(coverage.length, questions.length, "coverage length should match question count");
  assert.ok(
    coverage.some((c) => c.confidence === "HIGH" || c.confidence === "MED"),
    "coverage should return at least one MED or HIGH match"
  );

  await EvidenceUpload.deleteMany({ _id: ingest.upload._id });
  await EvidencePage.deleteMany({ uploadId: ingest.upload._id });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
