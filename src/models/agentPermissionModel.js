/**
 * agent-permissions
 *
 * Per-tenant policy: which roles can call which AI agents, with what quotas.
 * One row per tenant. Edited via the Admin Panel · AI Agents section.
 *
 * Resolution order (in agentPermissionService):
 *   1. user-specific override (rare)
 *   2. role policy
 *   3. tenant default policy ("deny" by default)
 *   4. tenant-level cap (always last gate)
 */
import mongoose from "mongoose";

const QuotaPolicySchema = new mongoose.Schema(
  {
    allow: { type: Boolean, default: true },
    dailyQuota: { type: Number, default: null },        // null = unlimited
    monthlyQuota: { type: Number, default: null },      // null = unlimited
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const AgentPermissionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },

    // Map: roleName → { agentKey → QuotaPolicy }
    // Example shape (Mongoose Mixed for flexibility):
    //   permissions: {
    //     audit_lead: {
    //       "audit.report.assemble": { allow: true, dailyQuota: 50, monthlyQuota: 1000 },
    //       "audit.observation.draft": { allow: true, dailyQuota: 200, monthlyQuota: 4000 },
    //       ...
    //     },
    //     supplier: { ... },
    //   }
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },

    // User-specific overrides (sparse — most users use role policy):
    //   userOverrides: {
    //     "<userId>": { "audit.report.assemble": { allow: false } }
    //   }
    userOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Tenant-wide cap — always enforced regardless of role/user policy
    tenantQuota: {
      monthlyTokenLimit: { type: Number, default: null },     // null = unlimited
      monthlyCostLimitUsd: { type: Number, default: null },   // null = unlimited
      enforcement: { type: String, enum: ["hard", "soft", "unlimited"], default: "soft" },
      alertAt: { type: [Number], default: [0.7, 0.9, 1.0] },
    },

    // Default policy when no role match found
    defaultPolicy: { type: String, enum: ["allow", "deny"], default: "deny" },

    // Tenant labour rate for ROI computation (hourly cost in USD)
    laborRateUsd: { type: Number, default: 40 },

    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { collection: "agent-permissions" }
);

AgentPermissionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const AgentPermission = mongoose.model("agent-permissions", AgentPermissionSchema);
