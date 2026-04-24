/**
 * The Novex seed originally assigned role="user" to some personas,
 * which isn't in any route allow-list and causes 403s everywhere.
 * Normalise every Novex persona to a role that actually grants access.
 *
 * Mapping follows the persona's real job:
 *   qa.specialist   → admin (EQMS manager)
 *   qa.head         → admin
 *   audit.program   → buyer       (runs cross-supplier audit program)
 *   audit.lead      → auditor
 *   qc.lab          → admin
 *   maintenance     → admin
 *   doc.control     → admin
 *   training.coord  → admin
 *   production.head → admin
 *   regulatory      → admin
 *   vp.quality      → tenant_admin
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import "../src/models/tenantModel.js";
import "../src/models/userModel.js";

const mapping = {
  "qa.specialist@novex-pharma.demo":   "admin",
  "qa.head@novex-pharma.demo":         "admin",
  "audit.program@novex-pharma.demo":   "buyer",
  "audit.lead@novex-pharma.demo":      "auditor",
  "qc.lab@novex-pharma.demo":          "admin",
  "maintenance@novex-pharma.demo":     "admin",
  "doc.control@novex-pharma.demo":     "admin",
  "training.coord@novex-pharma.demo":  "admin",
  "production.head@novex-pharma.demo": "admin",
  "regulatory@novex-pharma.demo":      "admin",
  "vp.quality@novex-pharma.demo":      "tenant_admin",
};

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}`);

const User = mongoose.model("users");
const Tenant = mongoose.model("Tenant");
const tenant = await Tenant.findOne({ name: "novex-pharma-eqms" });
if (!tenant) { console.error("Novex tenant not found"); process.exit(1); }

let updated = 0;
for (const [email, role] of Object.entries(mapping)) {
  const u = await User.findOne({ email, tenant_id: tenant._id });
  if (!u) { console.log(`  · missing user ${email}`); continue; }
  const before = u.role;
  if (before === role) {
    console.log(`  = ${email.padEnd(40)} already ${role}`);
    continue;
  }
  u.role = role;
  await u.save();
  updated++;
  console.log(`  ✓ ${email.padEnd(40)} ${before} → ${role}`);
}

console.log(`\n✓ updated ${updated} user role(s)`);
await mongoose.disconnect();
