import "../src/config/loadEnv.js";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

console.log("Database:", db.databaseName);

const collections = await db.listCollections().toArray();
console.log("\nNon-empty collections:");
for (const col of collections.sort((a, b) => a.name.localeCompare(b.name))) {
  const count = await db.collection(col.name).countDocuments();
  if (count > 0) console.log(`  ${col.name}: ${count} records`);
}

// Check audit collection specifically
for (const name of ["audit-request-masters", "audit-requests-masters"]) {
  const count = await db.collection(name).countDocuments();
  console.log(`\n${name}: ${count} total`);
  if (count > 0) {
    const sample = await db.collection(name).findOne({}, { projection: { tenantOrgId: 1, high_status: 1, trackStatus: 1 } });
    console.log("  sample:", JSON.stringify(sample));
    const tenantIds = await db.collection(name).distinct("tenantOrgId");
    console.log("  distinct tenantOrgId values:", tenantIds.slice(0, 5));
  }
}

await mongoose.disconnect();
