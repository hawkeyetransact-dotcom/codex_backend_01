import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/userModel.js";
import { DigiLockerDocument } from "../src/models/digilockerDocumentModel.js";
import { DigiLockerDocumentVersion } from "../src/models/digilockerDocumentVersionModel.js";
import { DigiLockerDocumentExtraction } from "../src/models/digilockerDocumentExtractionModel.js";

const isLocalUri = (uri) => /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(uri || "");

const ensureSafe = () => {
  if (process.env.USE_MEMORY_DB === "true") return;
  const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI || "";
  if (process.env.DIGILOCKER_SEED_ALLOW === "true") return;
  if (!isLocalUri(mongoUri)) {
    console.error("Refusing to seed DigiLocker demo data on non-local database.");
    console.error("Set DIGILOCKER_SEED_ALLOW=true to override, or use a localhost Mongo URI.");
    process.exit(1);
  }
};

const SEED_DOCS = [
  {
    title: "SOP - Cleaning and Sanitization",
    docType: "SOP",
    department: "QA",
    tags: ["cleaning", "sanitization", "sop"],
    confidentiality: "SharedWithAuditor",
    extractedText: "Standard Operating Procedure SOP-CLN-001 Effective Date 01/01/2024",
  },
  {
    title: "EHS Policy",
    docType: "Policy",
    department: "EHS",
    tags: ["safety", "policy"],
    confidentiality: "SharedWithAuditor",
    extractedText: "Environmental Health and Safety Policy Revision 2 Effective Date 02/14/2024",
  },
  {
    title: "Calibration Log - Q4",
    docType: "Log",
    department: "Engineering",
    tags: ["calibration", "equipment"],
    confidentiality: "Internal",
    extractedText: "Calibration log for equipment EQP-2024-11. Next calibration due 12/31/2024",
  },
];

const main = async () => {
  ensureSafe();
  await connectDatabase();

  const supplier = await User.findOne({ role: "supplier" }).lean();
  if (!supplier) {
    console.log("No supplier users found. Skipping DigiLocker seed.");
    await mongoose.disconnect();
    return;
  }

  for (const seed of SEED_DOCS) {
    const existing = await DigiLockerDocument.findOne({
      tenantId: supplier.tenant_id,
      supplierOrgId: supplier._id,
      title: seed.title,
    });
    if (existing) continue;

    const doc = await DigiLockerDocument.create({
      tenantId: supplier.tenant_id,
      supplierOrgId: supplier._id,
      ownerUserId: supplier._id,
      title: seed.title,
      description: "",
      tags: seed.tags,
      docType: seed.docType,
      department: seed.department,
      confidentiality: seed.confidentiality,
      status: "Submitted",
    });

    const version = await DigiLockerDocumentVersion.create({
      tenantId: supplier.tenant_id,
      documentId: doc._id,
      versionLabel: "v1.0",
      effectiveDate: new Date(),
      file: {
        storageProvider: "local",
        key: "seed/demo.txt",
        url: "seed://digilocker/demo",
        originalFileName: `${seed.title}.txt`,
        mimeType: "text/plain",
        sizeBytes: seed.extractedText.length,
        checksumSha256: "seed",
      },
      uploadedBy: supplier._id,
      uploadedAt: new Date(),
    });

    await DigiLockerDocumentExtraction.create({
      tenantId: supplier.tenant_id,
      documentId: doc._id,
      versionId: version._id,
      provider: "mock",
      classification: {
        docTypeGuess: seed.docType,
        departmentGuess: seed.department,
        confidence: 0.7,
      },
      suggestedTags: seed.tags.map((tag) => ({ tag, confidence: 0.6 })),
      keyFields: {},
    });

    doc.currentVersionId = version._id;
    doc.aiSummary = `${seed.docType} ${seed.department}`;
    doc.aiConfidence = 0.7;
    await doc.save();
  }

  console.log("Seeded DigiLocker demo documents.");
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("seed-digilocker-demo failed", err);
  process.exit(1);
});
