/**
 * Backfill `auditorAffiliation` on AuditorProfile docs created before the
 * field existed. Defaults everyone to 'external' since the existing demo
 * data is the AuditCorp 3rd-party org.
 *
 * Run: node scripts/backfill-auditor-affiliation.mjs
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";

await mongoose.connect(process.env.MONGO_URI);

const result = await AuditorProfile.updateMany(
  { auditorAffiliation: { $exists: false } },
  { $set: { auditorAffiliation: "external" } }
);
console.log(`Backfilled ${result.modifiedCount} AuditorProfile docs with auditorAffiliation='external'`);

await mongoose.connection.close();
process.exit(0);
