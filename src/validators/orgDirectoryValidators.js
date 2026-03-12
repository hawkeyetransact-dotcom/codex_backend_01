import Joi from "joi";

const contactPointValidator = Joi.object({
  type: Joi.string().optional(),
  name: Joi.string().allow("", null).optional(),
  email: Joi.string().allow("", null).optional(),
  phone: Joi.string().allow("", null).optional(),
});

const headquartersValidator = Joi.object({
  address1: Joi.string().allow("", null).optional(),
  address2: Joi.string().allow("", null).optional(),
  address3: Joi.string().allow("", null).optional(),
  city: Joi.string().allow("", null).optional(),
  state: Joi.string().allow("", null).optional(),
  postalCode: Joi.string().allow("", null).optional(),
  country: Joi.string().allow("", null).optional(),
}).optional();

const identifiersValidator = Joi.object({
  duns: Joi.string().allow("", null).optional(),
  fei: Joi.string().allow("", null).optional(),
  taxId: Joi.string().allow("", null).optional(),
  registrationNo: Joi.string().allow("", null).optional(),
  vatNo: Joi.string().allow("", null).optional(),
  cageCode: Joi.string().allow("", null).optional(),
}).optional();

export const createOrganizationValidator = Joi.object({
  legalName: Joi.string().trim().required(),
  displayName: Joi.string().allow("", null).optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "PENDING_REVIEW", "MERGED").optional(),
  entityTypes: Joi.array().items(Joi.string()).optional(),
  supplyChainRoles: Joi.array().items(Joi.string()).optional(),
  website: Joi.string().allow("", null).optional(),
  domains: Joi.array().items(Joi.string()).optional(),
  headquarters: headquartersValidator,
  identifiers: identifiersValidator,
  contactPoints: Joi.array().items(contactPointValidator).optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
  metadata: Joi.object().unknown(true).optional(),
  claimForCurrentTenant: Joi.boolean().optional(),
  claimType: Joi.string().valid("PRIMARY", "AFFILIATE", "INFERRED", "PLATFORM_CREATED").optional(),
  confidence: Joi.number().min(0).max(1).optional(),
  isPrimary: Joi.boolean().optional(),
});

export const updateOrganizationValidator = Joi.object({
  legalName: Joi.string().trim().optional(),
  displayName: Joi.string().allow("", null).optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "PENDING_REVIEW", "MERGED").optional(),
  entityTypes: Joi.array().items(Joi.string()).optional(),
  supplyChainRoles: Joi.array().items(Joi.string()).optional(),
  website: Joi.string().allow("", null).optional(),
  domains: Joi.array().items(Joi.string()).optional(),
  headquarters: headquartersValidator,
  identifiers: identifiersValidator,
  contactPoints: Joi.array().items(contactPointValidator).optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
  metadata: Joi.object().unknown(true).optional(),
}).min(1);

export const createOrgClaimValidator = Joi.object({
  orgId: Joi.string().required(),
  claimType: Joi.string().valid("PRIMARY", "AFFILIATE", "INFERRED", "PLATFORM_CREATED").optional(),
  confidence: Joi.number().min(0).max(1).optional(),
  isPrimary: Joi.boolean().optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
});

export const approveOrgClaimValidator = Joi.object({
  status: Joi.string().valid("ACTIVE", "REJECTED", "REVOKED").required(),
});

export const createOrgSiteValidator = Joi.object({
  siteName: Joi.string().trim().required(),
  siteType: Joi.string().valid("HEADQUARTERS", "MANUFACTURING", "WAREHOUSE", "LAB", "OFFICE", "DISTRIBUTION", "OTHER").optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "PENDING_REVIEW", "CLOSED").optional(),
  address: Joi.object({
    address1: Joi.string().allow("", null).optional(),
    address2: Joi.string().allow("", null).optional(),
    address3: Joi.string().allow("", null).optional(),
    city: Joi.string().allow("", null).optional(),
    state: Joi.string().allow("", null).optional(),
    postalCode: Joi.string().allow("", null).optional(),
    country: Joi.string().allow("", null).optional(),
  }).optional(),
  regulatoryIds: Joi.object({
    duns: Joi.string().allow("", null).optional(),
    fei: Joi.string().allow("", null).optional(),
    euGmpId: Joi.string().allow("", null).optional(),
    fssai: Joi.string().allow("", null).optional(),
    localLicense: Joi.string().allow("", null).optional(),
  }).optional(),
  gxpScopes: Joi.array().items(Joi.string()).optional(),
  contactName: Joi.string().allow("", null).optional(),
  contactEmail: Joi.string().allow("", null).optional(),
  contactPhone: Joi.string().allow("", null).optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
  metadata: Joi.object().unknown(true).optional(),
});

export const updateOrgSiteValidator = Joi.object({
  siteName: Joi.string().trim().optional(),
  siteType: Joi.string().valid("HEADQUARTERS", "MANUFACTURING", "WAREHOUSE", "LAB", "OFFICE", "DISTRIBUTION", "OTHER").optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE", "PENDING_REVIEW", "CLOSED").optional(),
  address: Joi.object().unknown(true).optional(),
  regulatoryIds: Joi.object().unknown(true).optional(),
  gxpScopes: Joi.array().items(Joi.string()).optional(),
  contactName: Joi.string().allow("", null).optional(),
  contactEmail: Joi.string().allow("", null).optional(),
  contactPhone: Joi.string().allow("", null).optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
  metadata: Joi.object().unknown(true).optional(),
}).min(1);

export const createOrgUnitValidator = Joi.object({
  parentUnitId: Joi.string().allow("", null).optional(),
  siteId: Joi.string().allow("", null).optional(),
  unitType: Joi.string().valid("DIVISION", "BUSINESS_UNIT", "PLANT", "DEPARTMENT", "TEAM", "OTHER").optional(),
  name: Joi.string().trim().required(),
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
  metadata: Joi.object().unknown(true).optional(),
});

export const updateOrgUnitValidator = Joi.object({
  parentUnitId: Joi.string().allow("", null).optional(),
  siteId: Joi.string().allow("", null).optional(),
  unitType: Joi.string().valid("DIVISION", "BUSINESS_UNIT", "PLANT", "DEPARTMENT", "TEAM", "OTHER").optional(),
  name: Joi.string().trim().optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
  metadata: Joi.object().unknown(true).optional(),
}).min(1);

export const createOrgUserAssignmentValidator = Joi.object({
  userId: Joi.string().required(),
  siteId: Joi.string().allow("", null).optional(),
  orgUnitId: Joi.string().allow("", null).optional(),
  managerUserId: Joi.string().allow("", null).optional(),
  orgRole: Joi.string()
    .valid(
      "ORG_OWNER",
      "ORG_ADMIN",
      "SITE_LEAD",
      "DEPARTMENT_LEAD",
      "QUALITY_LEAD",
      "PROCUREMENT_LEAD",
      "AUDIT_COORDINATOR",
      "MEMBER",
      "VIEWER"
    )
    .optional(),
  assignmentType: Joi.string().valid("PRIMARY", "SECONDARY", "DOTTED_LINE", "APPROVER", "OWNER").optional(),
  businessFunction: Joi.string()
    .valid(
      "QUALITY",
      "PROCUREMENT",
      "OPERATIONS",
      "WAREHOUSE",
      "REGULATORY",
      "LAB",
      "SUPPLY_CHAIN",
      "ENGINEERING",
      "MANAGEMENT",
      "OTHER"
    )
    .optional(),
  title: Joi.string().allow("", null).optional(),
  isPrimary: Joi.boolean().optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
  startDate: Joi.date().iso().optional().allow(null),
  endDate: Joi.date().iso().optional().allow(null),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  metadata: Joi.object().unknown(true).optional(),
});

export const updateOrgUserAssignmentValidator = Joi.object({
  userId: Joi.string().optional(),
  siteId: Joi.string().allow("", null).optional(),
  orgUnitId: Joi.string().allow("", null).optional(),
  managerUserId: Joi.string().allow("", null).optional(),
  orgRole: Joi.string()
    .valid(
      "ORG_OWNER",
      "ORG_ADMIN",
      "SITE_LEAD",
      "DEPARTMENT_LEAD",
      "QUALITY_LEAD",
      "PROCUREMENT_LEAD",
      "AUDIT_COORDINATOR",
      "MEMBER",
      "VIEWER"
    )
    .optional(),
  assignmentType: Joi.string().valid("PRIMARY", "SECONDARY", "DOTTED_LINE", "APPROVER", "OWNER").optional(),
  businessFunction: Joi.string()
    .valid(
      "QUALITY",
      "PROCUREMENT",
      "OPERATIONS",
      "WAREHOUSE",
      "REGULATORY",
      "LAB",
      "SUPPLY_CHAIN",
      "ENGINEERING",
      "MANAGEMENT",
      "OTHER"
    )
    .optional(),
  title: Joi.string().allow("", null).optional(),
  isPrimary: Joi.boolean().optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
  startDate: Joi.date().iso().optional().allow(null),
  endDate: Joi.date().iso().optional().allow(null),
  sourceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
  metadata: Joi.object().unknown(true).optional(),
}).min(1);

export const createEngagementValidator = Joi.object({
  buyerOrgId: Joi.string().required(),
  supplierOrgId: Joi.string().required(),
  status: Joi.string().valid("DRAFT", "ACTIVE", "SUSPENDED", "CLOSED").optional(),
  scope: Joi.object().unknown(true).optional(),
  visibilityPolicy: Joi.object().unknown(true).optional(),
  startDate: Joi.date().iso().optional().allow(null),
  endDate: Joi.date().iso().optional().allow(null),
});

export const addEngagementParticipantValidator = Joi.object({
  participantType: Joi.string().valid("TENANT", "ORG", "USER").required(),
  tenantId: Joi.string().optional().allow("", null),
  orgId: Joi.string().optional().allow("", null),
  userId: Joi.string().optional().allow("", null),
  role: Joi.string()
    .valid("BUYER_OWNER", "BUYER_MEMBER", "SUPPLIER_OWNER", "SUPPLIER_MEMBER", "AUDITOR", "VIEWER", "ADMIN")
    .required(),
  permissions: Joi.array().items(Joi.string()).optional(),
  accessStartsAt: Joi.date().iso().optional().allow(null),
  accessExpiresAt: Joi.date().iso().optional().allow(null),
  assignmentScope: Joi.object().unknown(true).optional(),
});

export const createOrgCatalogItemValidator = Joi.object({
  orgId: Joi.string().required(),
  siteIds: Joi.array().items(Joi.string()).optional(),
  itemType: Joi.string().valid("PRODUCT", "SERVICE", "CAPABILITY").optional(),
  catalogType: Joi.string()
    .valid("API", "EXCIPIENT", "PACKAGING", "ANALYTICAL_SERVICE", "LOGISTICS", "CONSULTING", "OTHER")
    .optional(),
  name: Joi.string().required(),
  apiMasterId: Joi.string().optional().allow("", null),
  casNumber: Joi.string().optional().allow("", null),
  gxpFlags: Joi.array().items(Joi.string()).optional(),
  visibility: Joi.string().valid("PUBLIC", "RESTRICTED", "PRIVATE").optional(),
  status: Joi.string().valid("DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED").optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
});

export const createMarketplaceListingValidator = Joi.object({
  orgId: Joi.string().required(),
  listingType: Joi.string().valid("ORG_PROFILE", "SERVICE", "PRODUCT", "SITE_CAPABILITY").optional(),
  visibility: Joi.string().valid("PUBLIC", "RESTRICTED", "PRIVATE").optional(),
  status: Joi.string().valid("DRAFT", "ACTIVE", "PAUSED", "ARCHIVED").optional(),
  headline: Joi.string().optional().allow("", null),
  summary: Joi.string().optional().allow("", null),
  capabilityTags: Joi.array().items(Joi.string()).optional(),
  countriesServed: Joi.array().items(Joi.string()).optional(),
  legacyRefs: Joi.object().unknown(true).optional(),
});

export const createQualificationCaseValidator = Joi.object({
  buyerOrgId: Joi.string().required(),
  supplierOrgId: Joi.string().required(),
  engagementId: Joi.string().optional().allow("", null),
  criticality: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").optional(),
  riskBand: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").optional(),
  decision: Joi.string().valid("PENDING", "APPROVED", "CONDITIONAL", "REJECTED").optional(),
  status: Joi.string().valid("DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN").optional(),
  scope: Joi.object().unknown(true).optional(),
  approvedScope: Joi.object().unknown(true).optional(),
  requalDueDate: Joi.date().iso().optional().allow(null),
});

export const updateQualificationCaseValidator = Joi.object({
  criticality: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").optional(),
  riskBand: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").optional(),
  decision: Joi.string().valid("PENDING", "APPROVED", "CONDITIONAL", "REJECTED").optional(),
  status: Joi.string().valid("DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN").optional(),
  scope: Joi.object().unknown(true).optional(),
  approvedScope: Joi.object().unknown(true).optional(),
  requalDueDate: Joi.date().iso().optional().allow(null),
  legacyRefs: Joi.object().unknown(true).optional(),
}).min(1);

export const createQualificationMethodValidator = Joi.object({
  methodType: Joi.string()
    .valid("DESK_REVIEW", "AUDIT_REQUIRED", "SAMPLING_VERIFICATION", "QUESTIONNAIRE", "REFERENCE_CHECK", "OTHER")
    .required(),
  status: Joi.string().valid("PLANNED", "IN_PROGRESS", "COMPLETED", "WAIVED").optional(),
  rationale: Joi.string().allow("", null).optional(),
  outcome: Joi.string().allow("", null).optional(),
  evidenceRefs: Joi.array().items(Joi.object().unknown(true)).optional(),
});

