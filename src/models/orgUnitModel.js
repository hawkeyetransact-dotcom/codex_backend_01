import mongoose from "mongoose";

const orgUnitSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organizations",
      required: true,
      index: true,
    },
    parentUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "org_units",
      default: null,
      index: true,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "org_sites",
      default: null,
      index: true,
    },
    unitType: {
      type: String,
      enum: ["DIVISION", "BUSINESS_UNIT", "PLANT", "DEPARTMENT", "TEAM", "OTHER"],
      default: "OTHER",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    path: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    sourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

orgUnitSchema.index({ orgId: 1, unitType: 1, status: 1 });
orgUnitSchema.index({ orgId: 1, siteId: 1, status: 1 });

export const OrgUnit = mongoose.model("org_units", orgUnitSchema);
