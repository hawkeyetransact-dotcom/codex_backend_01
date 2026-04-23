/**
 * diag-users.mjs — check test user existence and auth readiness
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { User } from "../src/models/userModel.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Database:", mongoose.connection.db.databaseName);
console.log("Cluster:", process.env.MONGO_URI.split("@")[1]?.split("/")[0]);

const testEmails = [
  "buyer1@test.com",
  "auditor1@test.com",
  "supplier1@test.com",
  "tenant_admin1@test.com",
  "superadmin1@test.com",
];

console.log("\nTest user check:");
for (const email of testEmails) {
  const u = await User.findOne({ email }).select("email role tenant_id passwordHash password");
  if (!u) {
    console.log(`  ❌ ${email} — NOT FOUND`);
  } else {
    const hasHash = !!(u.password || u.passwordHash);
    console.log(`  ✅ ${email} — role=${u.role}, tenant_id=${u.tenant_id ?? "null"}, hasPassword=${hasHash}`);
  }
}

await mongoose.disconnect();
