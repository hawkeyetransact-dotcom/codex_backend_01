import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { derivePhaseStateFromLegacy, normalizePhaseState } from "../src/services/auditPhaseService.js";

const argValue = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dryRun = process.argv.includes("--dryRun");
const limit = toNumber(argValue("--limit", undefined), undefined);
const batchSize = toNumber(argValue("--batchSize", 200), 200);
const startAfter = argValue("--startAfter", undefined);

const run = async () => {
  await connectDatabase();
  console.log("Starting backfill_audit_phase_state", { dryRun, limit, batchSize, startAfter });

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let lastId = startAfter;

  while (true) {
    if (limit && processed >= limit) break;
    const query = {
      ...(lastId ? { _id: { $gt: lastId } } : {}),
      $or: [{ phaseState: { $exists: false } }, { phaseState: null }],
    };
    const audits = await AuditRequestMaster.find(query).sort({ _id: 1 }).limit(batchSize).lean();
    if (!audits.length) break;

    for (const audit of audits) {
      if (limit && processed >= limit) break;
      processed += 1;
      lastId = String(audit._id);

      const derived = normalizePhaseState(derivePhaseStateFromLegacy(audit));
      if (dryRun) {
        updated += 1;
        continue;
      }

      try {
        await AuditRequestMaster.updateOne(
          { _id: audit._id, $or: [{ phaseState: { $exists: false } }, { phaseState: null }] },
          { $set: { phaseState: derived } }
        );
        updated += 1;
      } catch (err) {
        errors += 1;
        console.error("Failed to backfill audit", audit._id, err.message);
      }
    }
  }

  console.log("Backfill complete", { processed, updated, errors, lastId });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
