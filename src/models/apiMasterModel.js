import mongoose from "mongoose";

const apiMasterSchema = new mongoose.Schema(
  {
    canonicalName: { type: String, required: true },
    normalizedKey: { type: String, required: true, unique: true, index: true },
    casNumbers: { type: [String], default: [] },
    dmfNumbers: { type: [String], default: [] },
    synonyms: { type: [String], default: [] },
    apiTechnology: { type: String, default: "" },
    description: { type: String, default: "" },
    sourceTags: { type: [String], default: [] },
    identifiers: {
      cas: { type: [String], default: [] },
      unii: { type: String, default: null },
    },
    regulatoryPresence: {
      FDA_DMF: {
        count: { type: Number, default: 0 },
        dmfNumbers: { type: [String], default: [] },
      },
      EDQM_CEP: {
        count: { type: Number, default: 0 },
        cepNumbers: { type: [String], default: [] },
      },
      WHO_PQ: {
        count: { type: Number, default: 0 },
        statuses: { type: [String], default: [] },
      },
    },
    confidence: {
      score: { type: Number, default: 0 },
      reasons: { type: [String], default: [] },
    },
    firstSeenAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "merged", "deprecated"],
      default: "active",
    },
    mergedIntoApiMasterId: { type: mongoose.Schema.Types.ObjectId, ref: "api-master", default: null },
  },
  { timestamps: true }
);

apiMasterSchema.index({ normalizedKey: 1 }, { unique: true });
apiMasterSchema.index({ casNumbers: 1 });
apiMasterSchema.index({ canonicalName: 1 });

export const ApiMaster = mongoose.model("api-master", apiMasterSchema);
