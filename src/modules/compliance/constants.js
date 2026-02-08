export const COMPLIANCE_RUN_MODES = ["ADVISORY", "FINAL"];
export const COMPLIANCE_RUN_STATUSES = ["RUNNING", "COMPLETED", "FINALIZED", "FAILED"];
export const COMPLIANCE_REVIEW_STATUSES = ["OPEN", "REVIEWED"];
export const COMPLIANCE_STANDARD_STATUSES = ["ACTIVE", "ARCHIVED"];
export const COMPLIANCE_STANDARD_SCOPES = ["TENANT", "GLOBAL"];
export const COMPLIANCE_VERDICTS = [
  "COMPLIANT",
  "NON_COMPLIANT",
  "INSUFFICIENT",
  "NOT_APPLICABLE",
];

export const RESPONSE_SNAPSHOT_SOURCES = ["LIVE", "IMPORTED"];

export const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);
export const AUDITOR_ROLES = new Set(["auditor"]);
export const BUYER_ROLES = new Set(["buyer"]);
export const SUPPLIER_ROLES = new Set(["supplier", "supplieruser"]);

export const DEFAULT_STANDARD_VERSION = "1.0.0";

