import mongoose from "mongoose";

const fieldMappingSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    packKey: { type: String, required: true, trim: true, index: true },
    canonicalField: { type: String, required: true, trim: true },
    tenantField: { type: String, required: true, trim: true },
    transform: { type: String, default: "" },
    enabled: { type: Boolean, default: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

fieldMappingSchema.index({ tenantId: 1, packKey: 1, canonicalField: 1 }, { unique: true });
fieldMappingSchema.index({ tenantId: 1, packKey: 1, enabled: 1 });

export const FieldMapping = mongoose.model("field_mappings", fieldMappingSchema);

