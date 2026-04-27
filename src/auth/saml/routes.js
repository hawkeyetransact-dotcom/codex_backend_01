/**
 * SAML routes — SKELETON.
 *
 * NOT mounted in app.js until the strategy is implemented.
 * Mounting path (when ready): app.use("/api/auth/saml", samlRoutes);
 */
import { Router } from "express";
// import passport from "passport";
// import { samlStrategyForTenant } from "./strategy.js";

const router = Router();

router.get("/:tenantId/login", async (req, res) => {
  return res.status(501).json({
    error: "saml_not_implemented",
    docs: "src/auth/saml/README.md",
    message: "Install @node-saml/passport-saml and complete the strategy.js stub.",
  });
});

router.post("/:tenantId/acs", async (req, res) => {
  return res.status(501).json({ error: "saml_not_implemented" });
});

router.get("/:tenantId/metadata", async (req, res) => {
  return res.status(501).json({ error: "saml_not_implemented" });
});

router.get("/:tenantId/logout", async (req, res) => {
  return res.status(501).json({ error: "saml_not_implemented" });
});

export default router;
