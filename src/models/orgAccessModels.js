import mongoose from "mongoose";

const objectAclGrantSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    granteeTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    granteeOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    granteeUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null, index: true },
    permissions: { type: [String], default: [] },
    classification: {
      type: String,
      enum: ["internal", "shared", "audit_only", "public"],
      default: "shared",
      index: true,
    },
    accessStartsAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

objectAclGrantSchema.index({ resourceType: 1, resourceId: 1, status: 1 });
objectAclGrantSchema.index({ engagementId: 1, status: 1 });

const consentRecordSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    consentType: {
      type: String,
      enum: ["DOCUMENT_SHARE", "REPORT_SHARE", "AUDIT_SHARE", "MARKETPLACE_DISCLOSURE"],
      default: "DOCUMENT_SHARE",
      index: true,
    },
    grantedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    revokedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    revokedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

consentRecordSchema.index({ resourceType: 1, resourceId: 1, status: 1 });
consentRecordSchema.index({ orgId: 1, status: 1 });

const documentLinkSchema = new mongoose.Schema(
  {
    documentType: { type: String, required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    qualificationCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "qualification_cases",
      default: null,
      index: true,
    },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", default: null, index: true },
    linkedEntityType: { type: String, required: true, index: true },
    linkedEntityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    linkRole: { type: String, default: "reference", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

documentLinkSchema.index({ documentType: 1, documentId: 1 });
documentLinkSchema.index({ linkedEntityType: 1, linkedEntityId: 1 });

export const ObjectAclGrant = mongoose.model("object_acl_grants", objectAclGrantSchema);
export const ConsentRecord = mongoose.model("consent_records", consentRecordSchema);
export const DocumentLink = mongoose.model("document_links", documentLinkSchema);
