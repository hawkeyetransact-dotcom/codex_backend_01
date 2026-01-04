import { AdminAuditLog } from "../models/adminAuditLogModel.js";

export const resolveTenant = (req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ message: "Tenant context missing" });
  }
  next();
};

export const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};

export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.adminScope !== "PLATFORM") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export const requireTenantAdmin = (req, res, next) => {
  if (!req.user || !["tenant_admin", "superadmin", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (req.user.adminScope === "NONE") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

const redactSensitive = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  ["password", "passwordHash", "mfaSecret", "tokens"].forEach((field) => {
    if (clone[field]) clone[field] = "[REDACTED]";
  });
  return clone;
};

export const writeAdminAuditLog = async ({
  req,
  action,
  entityType,
  entityId,
  before,
  after,
  tenantId,
}) => {
  try {
    await AdminAuditLog.create({
      actorUserId: req.user?._id,
      actorEmail: req.user?.email,
      action,
      entityType,
      entityId,
      before: redactSensitive(before),
      after: redactSensitive(after),
      metadata: {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
      },
      tenant_id: tenantId || req.tenantId || null,
    });
  } catch (err) {
    console.error("Failed to write audit log", err.message);
  }
};
