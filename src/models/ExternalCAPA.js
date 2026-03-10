import mongoose from "mongoose";

const ExternalCAPASchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    externalCapaId: { type: String, required: true, index: true },
    auditObservationId: { type: mongoose.Schema.Types.ObjectId, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, index: true },
    severity: { type: String, enum: ["Critical", "Major", "Minor", "Info", "Unknown"], default: "Unknown" },
    status: { type: String, index: true },
    dueDate: { type: Date },
    closureEvidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdDate: { type: Date, index: true },
    closedDate: { type: Date },
    source: { type: String, enum: ["Hawkeye"], default: "Hawkeye" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ExternalCAPASchema.index({ tenantId: 1, externalCapaId: 1 }, { unique: true });
ExternalCAPASchema.index({ tenantId: 1, supplierId: 1, siteId: 1, status: 1 });

export const ExternalCAPA = mongoose.model("external-capas", ExternalCAPASchema);
