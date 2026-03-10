import mongoose from "mongoose";

const InternalCAPAReferenceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "integration-connections", index: true },
    internalCapaId: { type: String, required: true, index: true },
    externalSystem: {
      type: String,
      enum: ["TRACKWISE", "MASTERCONTROL", "VEEVA", "EUROFINS", "OTHER"],
      required: true,
      index: true,
    },
    externalCAPAId: { type: String, required: true, index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    severity: {
      type: String,
      enum: ["Critical", "Major", "Minor", "Info", "Unknown"],
      default: "Unknown",
      index: true,
    },
    status: { type: String, index: true },
    openedDate: { type: Date, index: true },
    closedDate: { type: Date },
    dueDate: { type: Date },
    riskCategory: { type: String, index: true },
    sourceAuditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    sourceEventId: { type: String },
    source: { type: String, enum: ["eQMS"], default: "eQMS" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

InternalCAPAReferenceSchema.index(
  { tenantId: 1, externalSystem: 1, externalCAPAId: 1 },
  { unique: true, sparse: true }
);
InternalCAPAReferenceSchema.index({ tenantId: 1, supplierId: 1, siteId: 1, status: 1 });

export const InternalCAPAReference = mongoose.model(
  "internal-capa-references",
  InternalCAPAReferenceSchema
);
