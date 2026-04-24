/**
 * One-shot migration: drop stale global-unique indexes that conflict with
 * new compound (tenantId, X) unique indexes.
 *
 * Run: node scripts/migrate-drop-stale-indexes.mjs
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}`);

const plan = [
  { collection: "change_controls", index: "changeNumber_1" },
];

for (const p of plan) {
  try {
    const indexes = await mongoose.connection.db.collection(p.collection).indexes();
    const found = indexes.find((i) => i.name === p.index);
    if (!found) {
      console.log(`  = ${p.collection}.${p.index} already absent`);
      continue;
    }
    await mongoose.connection.db.collection(p.collection).dropIndex(p.index);
    console.log(`  ✓ ${p.collection}.${p.index} dropped`);
  } catch (err) {
    console.error(`  ✗ ${p.collection}.${p.index}: ${err.message}`);
  }
}

await mongoose.disconnect();
console.log("done");
