import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";
import dotenv from "dotenv";
import { connectDatabase } from "../src/config/database.js";
import { DocIntelService } from "../src/services/docIntelService.js";

dotenv.config();

const createSamplePdf = async (targetPath) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const text = [
    "Facility safety and environmental compliance overview:",
    "The site maintains ethics, labor, environment, health and safety certifications including ISO 14001 and OHSAS 18001.",
    "Management reviews supplier approval procedures, corrective and preventive actions (CAPA), and audits are performed annually.",
    "Primary language English; emergency preparedness training documented.",
  ].join(" ");
  page.drawText(text, { x: 50, y: 700, size: 12, font, lineHeight: 16 });
  const pdfBytes = await pdfDoc.save();
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, pdfBytes);
  return targetPath;
};

const ensureTemplatePath = () => {
  if (process.env.PSCI_TEMPLATE_PATH) return process.env.PSCI_TEMPLATE_PATH;
  const fallback = path.join(
    process.cwd(),
    "uploads",
    "1765409212052-Full_PSCI_SAQ_&_Audit_Report_Template_for_Core_Suppliers,_External_Manufacturers,_Component_and_Material_Suppliers_(WORD_VERSION)_(1).docx"
  );
  return fallback;
};

const run = async () => {
  await connectDatabase();

  const tenantId = process.env.DEMO_TENANT_ID ? new mongoose.Types.ObjectId(process.env.DEMO_TENANT_ID) : new mongoose.Types.ObjectId();
  const userId = process.env.DEMO_USER_ID ? new mongoose.Types.ObjectId(process.env.DEMO_USER_ID) : new mongoose.Types.ObjectId();

  let pdfPath = process.env.DEMO_PDF_PATH || path.join(process.cwd(), "out", "demo-evidence.pdf");
  if (!fs.existsSync(pdfPath)) {
    pdfPath = await createSamplePdf(pdfPath);
  }

  const templateDocxPath = ensureTemplatePath();
  const buffer = await fs.promises.readFile(pdfPath);
  const file = { buffer, mimetype: "application/pdf", originalname: path.basename(pdfPath), size: buffer.length };

  console.log("Ingesting sample evidence:", pdfPath);
  const ingest = await DocIntelService.ingestPdf({ file, tenantId, uploaderId: userId });
  console.log(`Stored pages: ${ingest.pagesStored} | uploadId=${ingest.upload._id}`);

  console.log("Running coverage against template:", templateDocxPath);
  const coverage = await DocIntelService.coverageWithTemplate({ tenantId, templateDocxPath, topN: 3 });

  const counts = coverage.reduce(
    (acc, q) => {
      acc[q.confidence] = (acc[q.confidence] || 0) + 1;
      return acc;
    },
    { HIGH: 0, MED: 0, LOW: 0, NONE: 0 }
  );

  console.log(`Questions: ${coverage.length} | Pages: ${ingest.upload.pageCount}`);
  console.log("Confidence counts:", counts);
  console.log("Artifacts written to ./out/question_coverage.{json,csv}");
  process.exit(0);
};

run().catch((err) => {
  console.error("Coverage demo failed:", err);
  process.exit(1);
});

