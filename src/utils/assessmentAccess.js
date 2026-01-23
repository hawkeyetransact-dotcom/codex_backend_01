export const resolveSupplierOwnerId = (user) => {
  if (!user) return null;
  if (user.role === "supplier") return user._id;
  if (user.role === "supplierUser") return user.invitedBy || null;
  return null;
};

export const canAccessAssessment = (user, assessment) => {
  if (!user || !assessment) return false;
  const role = user.role;
  if (["admin", "superadmin", "tenant_admin"].includes(role)) return true;
  const userId = String(user._id);

  const assigned = (assessment.assignedAuditors || []).some((a) => String(a.userId) === userId);
  const participant = (assessment.participants || []).some((p) => String(p.userId) === userId);
  if (assigned || participant) return true;

  const supplierOwnerId = resolveSupplierOwnerId(user);
  if (supplierOwnerId && assessment.scope?.supplierId && String(assessment.scope.supplierId) === String(supplierOwnerId)) {
    return true;
  }

  if (assessment.scope?.buyerId && String(assessment.scope.buyerId) === userId) return true;

  return false;
};
