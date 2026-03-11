import mongoose from "mongoose";

const contactPointSchema = new mongoose.Schema(
  {
    type: { type: String, default: "general" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    directoryKey: { type: String, required: true, unique: true, index: true },
    legalName: { type: String, required: true, trim: true },
    normalizedLegalName: { type: String, required: true, index: true },
    displayName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "PENDING_REVIEW", "MERGED"],
      default: "ACTIVE",
      index: true,
    },
    entityTypes: {
      type: [String],
      default: [],
      index: true,
    },
    supplyChainRoles: {
      type: [String],
      default: [],
      index: true,
    },
    website: { type: String, default: "" },
    domains: { type: [String], default: [] },
    headquarters: {
      address1: { type: String, default: "" },
      address2: { type: String, default: "" },
      address3: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "", index: true },
    },
    identifiers: {
      duns: { type: String, default: "" },
      fei: { type: String, default: "" },
      taxId: { type: String, default: "" },
      registrationNo: { type: String, default: "" },
      vatNo: { type: String, default: "" },
      cageCode: { type: String, default: "" },
    },
    contactPoints: { type: [contactPointSchema], default: [] },
    sourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

organizationSchema.index({ normalizedLegalName: 1, "headquarters.country": 1 });
organizationSchema.index({ supplyChainRoles: 1, status: 1 });
organizationSchema.index({ entityTypes: 1, status: 1 });

export const Organization = mongoose.model("organizations", organizationSchema);
