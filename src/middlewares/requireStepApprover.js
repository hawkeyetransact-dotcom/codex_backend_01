/**
 * requireStepApprover.js — Part-11 separation-of-duties + role gate.
 *
 * Validates, before any signed approval transition, that:
 *   1. The caller is NOT the record's creator / submitter (separation of duties).
 *   2. The caller's role matches the approval step's required role
 *      (or any role in step.assignedRoles[] if multi-role).
 *
 * On rejection returns 403 with a diagnosis envelope explaining exactly why
 * (so the user or buyer can self-resolve without server logs).
 *
 * Usage (route file):
 *   import { requireStepApprover } from "../middlewares/requireStepApprover.js";
 *
 *   router.post("/:id/approve",
 *     authenticate,
 *     requireStepApprover({
 *       Model: DocumentControl,
 *       recordType: "document_control",
 *       ownerFields: ["ownerId", "submittedForReviewBy"],
 *       resolveStep: (record, req) => {
 *         const stepOrder = req.body?.stepOrder;
 *         return record.approvalSteps?.find((s) => s.stepOrder === stepOrder);
 *       },
 *       roleField: "role",
 *     }),
 *     requireESignature({ recordType: "document_control", meaning: "APPROVED" }),
 *     handler
 *   );
 */
const ADMIN_ROLES = new Set(["admin", "tenant_admin", "superadmin"]);

const normalizeRole = (s) => String(s || "").toLowerCase().replace(/[\s_-]+/g, "");

const rolesMatch = (userRole, requiredRoles) => {
  if (!requiredRoles?.length) return true; // no role required → any approver allowed (but SoD still checked)
  const u = normalizeRole(userRole);
  return requiredRoles.some((r) => normalizeRole(r) === u);
};

export function requireStepApprover({
  Model,
  recordType,
  ownerFields = ["ownerId"],
  resolveStep, // (record, req) => step | null
  roleField = "role",
  rolesField,  // optional — if step has e.g. assignedRoles[]
  allowSelfApprove = false, // emergency override flag
} = {}) {
  if (!Model) throw new Error("requireStepApprover: Model is required");
  if (typeof resolveStep !== "function") {
    throw new Error("requireStepApprover: resolveStep(record, req) is required");
  }

  return async (req, res, next) => {
    try {
      const id = req.params?.id || req.params?.auditId;
      if (!id) return res.status(400).json({ error: "Missing :id in route params" });

      const record = await Model.findById(id);
      if (!record) return res.status(404).json({ error: `${recordType} not found` });

      const userId = req.user?._id ? String(req.user._id) : null;
      const userRole = req.user?.role;

      // Admins always pass (intentional — emergency / regulator escalation).
      // We still record the actor in the audit trail downstream.
      if (ADMIN_ROLES.has(String(userRole).toLowerCase())) {
        return next();
      }

      // 1) SEPARATION OF DUTIES — caller must not be the record creator.
      if (!allowSelfApprove) {
        const ownerIds = ownerFields
          .map((f) => record[f])
          .filter(Boolean)
          .map((v) => String(v));
        if (userId && ownerIds.includes(userId)) {
          return res.status(403).json({
            error: "Forbidden — you cannot approve your own submission",
            reason: "SEPARATION_OF_DUTIES",
            diagnosis: {
              recordType,
              recordId: String(record._id),
              yourUserId: userId,
              recordOwnerFields: ownerFields,
              ownerIds,
              hint:
                "21 CFR Part 11 / ISO 9001 require approver and submitter to be different people. " +
                "Ask another qualified user to approve.",
            },
          });
        }
      }

      // 2) ROLE GATE — caller's role must match the step's required role.
      const step = await resolveStep(record, req);
      if (!step) {
        return res.status(400).json({
          error: "Approval step not found",
          reason: "STEP_NOT_FOUND",
          diagnosis: { recordType, recordId: String(record._id), provided: req.body },
        });
      }

      const required = []
        .concat(step[roleField] ? [step[roleField]] : [])
        .concat(rolesField && Array.isArray(step[rolesField]) ? step[rolesField] : []);

      if (required.length && !rolesMatch(userRole, required)) {
        return res.status(403).json({
          error: "Forbidden — your role does not match this approval step",
          reason: "ROLE_MISMATCH",
          diagnosis: {
            recordType,
            recordId: String(record._id),
            stepOrder: step.stepOrder ?? null,
            stepRequiresRole: required,
            yourRole: userRole,
            hint: `This step requires ${required.join(" or ")}. Either re-submit with a different reviewer, or have someone with the right role approve.`,
          },
        });
      }

      // Cache the loaded record so downstream handlers don't re-fetch.
      req.preloadedRecord = record;
      return next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}
