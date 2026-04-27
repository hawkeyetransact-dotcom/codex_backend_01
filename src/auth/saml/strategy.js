/**
 * SAML strategy factory — SKELETON.
 *
 * Returns a per-tenant passport-saml strategy configured from the saml-config
 * collection. Production: install @node-saml/passport-saml first.
 *
 * Usage:
 *   import { samlStrategyForTenant } from "./strategy.js";
 *   const strategy = await samlStrategyForTenant("acme-pharma-audit");
 *   passport.use(`saml-${tenantId}`, strategy);
 */

// import { Strategy as SamlStrategy } from "@node-saml/passport-saml"; // npm install before enabling
// import mongoose from "mongoose";

/**
 * Per-tenant SAML config (lives in MongoDB collection `saml-configs`).
 * Add the schema to src/models/samlConfigModel.js before completing this.
 */
async function loadSamlConfig(tenantId) {
  // const SamlConfig = mongoose.model("saml-configs");
  // return SamlConfig.findOne({ tenantId, enabled: true }).lean();
  throw new Error("SAML strategy not yet implemented — see src/auth/saml/README.md for completion steps.");
}

/**
 * Map SAML profile attributes → Hawkeye user upsert payload.
 */
export function mapSamlProfileToUser(profile, attributeMapping = {}) {
  const get = (attr) => profile[attr] ?? profile[attributeMapping[attr]] ?? null;
  return {
    email: get("email"),
    firstName: get("firstName"),
    lastName: get("lastName"),
    role: get("role") || "buyer",
    samlSessionIndex: profile.sessionIndex,
    nameID: profile.nameID,
  };
}

/**
 * @returns {Promise<SamlStrategy>}
 */
export async function samlStrategyForTenant(/* tenantId */) {
  // const cfg = await loadSamlConfig(tenantId);
  // if (!cfg) throw new Error(`No SAML config for tenant ${tenantId}`);
  //
  // return new SamlStrategy({
  //   path: `/api/auth/saml/${tenantId}/acs`,
  //   entryPoint: cfg.ssoUrl,
  //   issuer: `${process.env.SAML_HOST}/api/auth/saml/${tenantId}`,
  //   cert: cfg.cert,
  //   wantAssertionsSigned: true,
  //   wantAuthnResponseSigned: true,
  //   privateKey: fs.readFileSync(process.env.SAML_SP_PRIVATE_KEY_PATH, "utf8"),
  //   decryptionPvk: fs.readFileSync(process.env.SAML_SP_PRIVATE_KEY_PATH, "utf8"),
  // }, async (profile, done) => {
  //   try {
  //     const userPayload = mapSamlProfileToUser(profile, cfg.attributeMapping);
  //     // JIT provision: upsert User by email; assign tenantId from URL
  //     const user = await jitProvisionUser({ ...userPayload, tenantId });
  //     return done(null, user);
  //   } catch (err) { return done(err); }
  // });

  throw new Error("SAML strategy not yet implemented — see src/auth/saml/README.md for completion steps.");
}
