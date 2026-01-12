import mongoose from "mongoose";

const ComplianceEventCanonicalSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "integration-connections", index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    providerKey: { type: String, index: true },
    eventType: { type: String, index: true },
    eventId: { type: String, index: true },
    status: { type: String },
    severity: { type: String, enum: ["Critical", "Major", "Minor", "Info"] },
    openedDate: { type: Date },
    dueDate: { type: Date },
    closedDate: { type: Date },
    slaDays: { type: Number },
    actualDays: { type: Number },
    repeatEvent: { type: Boolean, default: false },
    siteId: { type: mongoose.Schema.Types.ObjectId },
    productId: { type: mongoose.Schema.Types.ObjectId },
    ownerRole: { type: String },
    linkedAuditId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ComplianceEventCanonicalSchema.index({ tenantId: 1, supplierId: 1, eventType: 1, openedDate: -1 });
ComplianceEventCanonicalSchema.index({ tenantId: 1, supplierId: 1, status: 1 });
ComplianceEventCanonicalSchema.index(
  { tenantId: 1, connectionId: 1, eventId: 1, eventType: 1 },
  { unique: true, sparse: true }
);

export const ComplianceEventCanonical = mongoose.model(
  "compliance-event-canonical",
  ComplianceEventCanonicalSchema
);
