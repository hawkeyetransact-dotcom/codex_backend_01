import mongoose from "mongoose";

const SourceSectionSchema = new mongoose.Schema({
  key: { type: String, required: true }, // fda_wl, fda_483, ema, customs, prior_audits, summary
  narrative: { type: String, default: "" },
  citations: { type: [String], default: [] },
  findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const SupplierRiskDossierSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  supplierId: { type: String, required: true, index: true },
  supplierName: { type: String },
  identifiers: { type: mongoose.Schema.Types.Mixed, default: {} },
  riskScore: { type: Number, default: 0 }, // 0-100
  riskBand: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
  sections: { type: [SourceSectionSchema], default: [] },
  dossierDate: { type: Date, default: Date.now },
  validUntilDate: { type: Date },
  citations: { type: [String], default: [] },
  aiPromptVersion: { type: String },
  aiConfidence: { type: Number },
}, { timestamps: true, collection: "supplier_risk_dossiers" });

SupplierRiskDossierSchema.index({ tenantId: 1, supplierId: 1, dossierDate: -1 });

export const SupplierRiskDossier = mongoose.model("supplier-risk-dossiers", SupplierRiskDossierSchema);
