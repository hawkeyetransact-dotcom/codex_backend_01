import mongoose from "mongoose";

const templateSchema = new mongoose.Schema(
  {
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

export const Template = mongoose.model("templates", templateSchema, "templates");
