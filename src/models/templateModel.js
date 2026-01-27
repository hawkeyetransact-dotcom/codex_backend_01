import mongoose from "mongoose";

const templateSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, default: null },
    templateId: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    riskcategory: { type: String, default: "" },
    Audittype: { type: String, default: "" },
    industry: { type: String, default: "" },
    categories: [{ type: String }],
    phaseKey: { type: String, default: null },
    artifactType: { type: String, default: null },
    regulatoryMapping: {
      standard: { type: String, default: "" },
      refs: [{ type: String }],
    },
    productType: { type: String, default: "" },
    riskLevel: { type: String, default: "" },
    visibility: {
      roles: [{ type: String }],
      tenantOnly: { type: Boolean, default: false },
    },
    templateType: { type: String, default: null },
    assessmentTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "assessment-types", default: null },
    sourceFile: { type: String, default: "" },
    sourceFileName: { type: String, default: "" },
    sourceMimeType: { type: String, default: "" },
    documentBody: { type: String, default: "" },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
    version: { type: Number, default: 1 },
    extractionConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

templateSchema.index({ templateId: 1 }, { unique: true });
templateSchema.index({ name: 1 });
templateSchema.index({ phaseKey: 1, artifactType: 1 });
templateSchema.index({ templateType: 1, assessmentTypeId: 1 });

export const Template = mongoose.model("templates", templateSchema, "templates");
