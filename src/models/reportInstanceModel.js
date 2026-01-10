import mongoose from "mongoose";

const reportInstanceHighlightSchema = new mongoose.Schema(
  {
    blockId: { type: String, required: true },
    placeholder: { type: String, required: true },
    value: { type: String, required: true },
    missing: { type: Boolean, default: false },
  },
  { _id: false }
);

const reportInstanceBlockSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    heading: { type: String },
    content: { type: String },
    originalContent: { type: String },
    segments: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    fields: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    rows: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    columns: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    items: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    observations: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    modified: { type: Boolean, default: false },
  },
  { _id: false }
);

const reportExportSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String },
    format: { type: String, default: "pdf" },
    exportedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reportInstanceSchema = new mongoose.Schema(
  {
    auditRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "report-templates", required: true },
    templateVersion: { type: Number, required: true },
    status: { type: String, enum: ["draft", "final"], default: "draft" },
    renderedBlocks: { type: [reportInstanceBlockSchema], default: [] },
    highlights: { type: [reportInstanceHighlightSchema], default: [] },
    exportHistory: { type: [reportExportSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

reportInstanceSchema.index({ auditRequestId: 1, templateId: 1, status: 1 });

export const ReportInstance = mongoose.model("report-instances", reportInstanceSchema);
