import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import Tenant from "../models/tenantModel.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // Fallback to cookie (authToken) so browser requests with httpOnly cookie still work
    if (!token && req.headers?.cookie) {
      const cookieString = req.headers.cookie;
      const cookies = Object.fromEntries(
        cookieString.split(";").map((c) => {
          const [k, ...v] = c.trim().split("=");
          return [k, v.join("=")];
        })
      );
      token = cookies["authToken"] || null;
    }

    if (!token) {
      return res.status(401).json({ error: "Access Denied. No token provided." });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from database
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ error: "Invalid Token. User not found." });
    }

    if (req.user.status === "DISABLED") {
      return res.status(403).json({ error: "User is disabled." });
    }

    req.tenantId = decoded.tenantId || req.user.tenant_id || null;
    req.adminScope = decoded.adminScope || req.user.adminScope || "NONE";

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

export const requireTenantActive = async (req, res, next) => {
  try {
    if (!req.tenantId) return res.status(400).json({ message: "Tenant context missing" });
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant || tenant.status !== "ACTIVE") {
      return res.status(403).json({ message: "Tenant suspended" });
    }
    req.tenant = tenant;
    next();
  } catch (err) {
    console.error("requireTenantActive", err);
    return res.status(500).json({ message: "Tenant check failed" });
  }
};

export const requireAdminScope = (scope = "TENANT") => (req, res, next) => {
  const allowed = Array.isArray(scope) ? scope : [scope];
  if (!req.adminScope || !allowed.includes(req.adminScope)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export const assertSameTenant = (tenantIdFromEntity, reqTenant) => {
  if (tenantIdFromEntity && reqTenant && String(tenantIdFromEntity) !== String(reqTenant)) {
    const err = new Error("Not Found");
    err.status = 404;
    throw err;
  }
};

export const tenantQuery = (req) => ({ tenantOrgId: req.tenantId });
