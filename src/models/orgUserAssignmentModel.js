import mongoose from "mongoose";

const orgUserAssignmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organizations",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "org_sites",
      default: null,
      index: true,
    },
    orgUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "org_units",
      default: null,
      index: true,
    },
    managerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
      index: true,
    },
    orgRole: {
      type: String,
      enum: [
        "ORG_OWNER",
        "ORG_ADMIN",
        "SITE_LEAD",
        "DEPARTMENT_LEAD",
        "QUALITY_LEAD",
        "PROCUREMENT_LEAD",
        "AUDIT_COORDINATOR",
        "MEMBER",
        "VIEWER",
      ],
      default: "MEMBER",
      index: true,
    },
    assignmentType: {
      type: String,
      enum: ["PRIMARY", "SECONDARY", "DOTTED_LINE", "APPROVER", "OWNER"],
      default: "PRIMARY",
      index: true,
    },
    businessFunction: {
      type: String,
      enum: [
        "QUALITY",
        "PROCUREMENT",
        "OPERATIONS",
        "WAREHOUSE",
        "REGULATORY",
        "LAB",
        "SUPPLY_CHAIN",
        "ENGINEERING",
        "MANAGEMENT",
        "OTHER",
      ],
      default: "OTHER",
      index: true,
    },
    title: { type: String, default: "", trim: true },
    isPrimary: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    sourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

orgUserAssignmentSchema.index(
  {
    tenantId: 1,
    orgId: 1,
    userId: 1,
    siteId: 1,
    orgUnitId: 1,
    orgRole: 1,
    assignmentType: 1,
  },
  { unique: true, sparse: true }
);
orgUserAssignmentSchema.index({ tenantId: 1, orgId: 1, status: 1 });
orgUserAssignmentSchema.index({ tenantId: 1, userId: 1, status: 1 });
orgUserAssignmentSchema.index({ orgId: 1, siteId: 1, orgUnitId: 1, status: 1 });

export const OrgUserAssignment = mongoose.model("org_user_assignments", orgUserAssignmentSchema);
