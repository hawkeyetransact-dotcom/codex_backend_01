export const PERSONAS = [
  "PLATFORM_ADMIN",
  "TENANT_ADMIN",
  "AUDITOR",
  "SUPPLIER_ADMIN",
  "SUPPLIER_USER",
  "BUYER_USER",
];

export const resolvePersonaFromUser = (user) => {
  if (!user) return null;
  if (user.adminScope === "PLATFORM") return "PLATFORM_ADMIN";
  if (user.role === "tenant_admin" || (user.role === "admin" && user.adminScope === "TENANT")) {
    return "TENANT_ADMIN";
  }
  if (user.role === "auditor") return "AUDITOR";
  if (user.role === "supplier") return "SUPPLIER_ADMIN";
  if (user.role === "supplierUser") return "SUPPLIER_USER";
  if (user.role === "buyer") return "BUYER_USER";
  return null;
};
