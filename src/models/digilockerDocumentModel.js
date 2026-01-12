import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    supplierOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products", index: true },
    department: {
      type: String,
      enum: ["QA", "QC", "Production", "Engineering", "Warehouse", "EHS", "Regulatory", "Other"],
      default: "Other",
      index: true,
    },
    docType: {
      type: String,
      enum: [
        "SOP",
        "Record",
        "Certificate",
        "Report",
        "Log",
        "ValidationProtocol",
        "ValidationReport",
        "Policy",
        "Manual",
        "Form",
        "Template",
        "Other",
      ],
      default: "Other",
      index: true,
    },
    title: { type: String, required: true, index: true },
    description: { type: String },
    tags: { type: [String], default: [], index: true },
    standardRefs: { type: [String], default: [] },
    confidentiality: {
      type: String,
      enum: ["Internal", "SharedWithAuditor", "Restricted"],
      default: "Internal",
      index: true,
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Superseded", "Archived"],
      default: "Draft",
      index: true,
    },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    currentVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_document_versions" },
    aiSummary: { type: String },
    aiConfidence: { type: Number, min: 0, max: 1 },
  },
  { timestamps: true }
);

DocumentSchema.index({ tenantId: 1, supplierOrgId: 1, siteId: 1, productId: 1 });
DocumentSchema.index({ tenantId: 1, docType: 1, department: 1, status: 1 });
DocumentSchema.index(
  { title: "text", description: "text", tags: "text", standardRefs: "text" },
  { name: "DocumentTextIndex" }
);

export const DigiLockerDocument = mongoose.model("digilocker_documents", DocumentSchema);
