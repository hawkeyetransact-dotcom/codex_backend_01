import mongoose from "mongoose";

const SupplierRiskEventSchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    eventType: {
      type: String,
      enum: [
        "PUBLIC_SIGNAL_UPDATED",
        "QUESTIONNAIRE_SUBMITTED",
        "FOLLOWUP_RESPONDED",
        "CAPA_UPDATED",
        "CAPA_CLOSED",
        "AUDIT_COMPLETED",
        "DOC_UPLOADED",
        "EVIDENCE_REVIEWED",
        "MANUAL_OVERRIDE",
      ],
      required: true,
    },
    eventAt: { type: Date, default: Date.now, index: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    correlationId: { type: String, index: true },
  },
  { timestamps: false }
);

SupplierRiskEventSchema.index({ supplierId: 1, eventAt: -1 });
SupplierRiskEventSchema.index({ correlationId: 1 });

export const SupplierRiskEvent = mongoose.model(
  "supplier-risk-events",
  SupplierRiskEventSchema
);
