/**
 * Org Admin (Hawkeye internal) — routes.
 * Mounted at /api/internal-admin
 *
 * SECURITY: in production, also restrict by IP allow-list at the platform layer
 * (Vercel function config or upstream WAF). The route-level check below (adminScope=PLATFORM)
 * is the second gate, not the first.
 */
import { Router } from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { listTenants, getAiOps } from "../controllers/orgAdminController.js";

const router = Router();

// Optional IP-allowlist gate. Configure in env var INTERNAL_ADMIN_IP_ALLOWLIST as comma-separated CIDRs.
function ipGate(req, res, next) {
  const allowlist = (process.env.INTERNAL_ADMIN_IP_ALLOWLIST || "").trim();
  if (!allowlist) return next(); // no allowlist configured → skip (dev/preview)
  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
  const allowed = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.some((a) => ip === a || ip.startsWith(a))) {
    return res.status(403).json({ error: "internal_admin_ip_blocked", ip });
  }
  next();
}

router.get("/tenants", ipGate, authenticate, requireTenantActive, listTenants);
router.get("/ai-ops",  ipGate, authenticate, requireTenantActive, getAiOps);

export default router;
