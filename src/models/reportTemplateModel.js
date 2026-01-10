import mongoose from "mongoose";

const reportTemplateFieldSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    placeholderPath: { type: String, required: true },
  },
  { _id: false }
);

const reportTemplateColumnSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    placeholderPath: { type: String, required: true },
    width: { type: Number },
  },
  { _id: false }
);

const reportTemplateBlockSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "title",
        "meta",
        "table",
        "bullets",
        "richText",
        "observations",
        "signoff",
        "pageBreak",
      ],
      required: true,
    },
    heading: { type: String },
    content: { type: String },
    fields: { type: [reportTemplateFieldSchema], default: undefined },
    columns: { type: [reportTemplateColumnSchema], default: undefined },
    rowsPath: { type: String },
    listPlaceholderPath: { type: String },
    observationMapping: { type: mongoose.Schema.Types.Mixed },
    styling: {
      alignment: { type: String },
      fontSize: { type: String },
      spacing: { type: String },
    },
  },
  { _id: false }
);

const reportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    blocks: { type: [reportTemplateBlockSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

reportTemplateSchema.index({ name: 1 });
reportTemplateSchema.index({ category: 1, isActive: 1 });

export const ReportTemplate = mongoose.model("report-templates", reportTemplateSchema);
