import mongoose from "mongoose";
import { AUDIT_MODULES } from "../modules/auditEngine/constants.js";

const PRODUCT_MODES = ["AUDIT_ONLY", "QMS_WITH_AUDIT", "QMS_ONLY"];

const tenantModuleConfigSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },
    enabledModules: {
      type: [String],
      enum: AUDIT_MODULES,
      default: ["cGMP"],
    },
    defaultModule: { type: String, enum: AUDIT_MODULES, default: "cGMP" },
    productMode: { type: String, enum: PRODUCT_MODES, default: "AUDIT_ONLY" },
    entitlements: { type: mongoose.Schema.Types.Mixed, default: {} },
    moduleSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

tenantModuleConfigSchema.index({ tenantId: 1, defaultModule: 1 });

export const TenantModuleConfig = mongoose.model("tenant-module-configs", tenantModuleConfigSchema);
