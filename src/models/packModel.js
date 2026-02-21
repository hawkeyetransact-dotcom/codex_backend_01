import mongoose from "mongoose";

const packTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    definition: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const packNodeTypeSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    extends: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const packSkillSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    provider: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const packSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    industry: { type: String, default: "" },
    status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE", index: true },
    templates: { type: [packTemplateSchema], default: [] },
    nodeTypes: { type: [packNodeTypeSchema], default: [] },
    skills: { type: [packSkillSchema], default: [] },
    validators: { type: [String], default: [] },
    uiWidgets: { type: [String], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

packSchema.index({ key: 1, version: 1 }, { unique: true });
packSchema.index({ key: 1, status: 1, updatedAt: -1 });

export const Pack = mongoose.model("packs", packSchema);

