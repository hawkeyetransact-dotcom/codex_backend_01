import mongoose from "mongoose";

const tableVariantSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    tableKey: { type: String, required: true, index: true },
    scope: { type: String, enum: ["SYSTEM", "TENANT", "USER"], required: true, index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    name: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    config: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

tableVariantSchema.index({ tableKey: 1, scope: 1, tenantId: 1, ownerUserId: 1 });

export const TableVariant = mongoose.model("table_variants", tableVariantSchema);
