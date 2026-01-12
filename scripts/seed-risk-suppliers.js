import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { User } from "../src/models/userModel.js";
import { SupplierPublicSignal } from "../src/models/SupplierPublicSignal.js";
import { SupplierRiskMetrics } from "../src/models/SupplierRiskMetrics.js";
import { recalculateSupplierRisk } from "../src/services/risk/riskOrchestrator.js";
import { connectDatabase } from "../src/config/database.js";

const SUPPLIER_EMAILS = [
  "supplier1@test.com",
  "supplier2@test.com",
  "supplier3@test.com",
  "supplier4@test.com",
  "supplier5@test.com",
];

const DEFAULT_PUBLIC = {
  fda483CountRecent24m: 0,
  warningLetterRecent24m: false,
  importAlertActive: false,
  inspectionsOpenCount: 0,
  recalls: [],
  sources: [],
  regionFlags: [],
};

const DEFAULT_METRICS = {
  questionnaireOnTimeRate: 0.85,
  avgResponseHoursToFollowups: 48,
  capaOverdueCount: 0,
  capaReopenRate: 0.1,
  evidenceQualityScore: 75,
  docCompletenessScore: 75,
  computedFrom: "manual",
};

const fillMissing = (target, defaults) => {
  const updates = {};
  Object.entries(defaults).forEach(([key, value]) => {
    if (target[key] === undefined || target[key] === null) {
      updates[key] = value;
    }
  });
  return updates;
};

const main = async () => {
  await connectDatabase();
  console.log("Connected to DB");

  for (const email of SUPPLIER_EMAILS) {
    const user = await User.findOne({ email }).lean();
    if (!user) {
      console.warn("Missing supplier user:", email);
      continue;
    }

    const existingPublic = await SupplierPublicSignal.findOne({ supplierId: user._id }).lean();
    if (!existingPublic) {
      await SupplierPublicSignal.create({ ...DEFAULT_PUBLIC, supplierId: user._id, updatedBy: user._id });
    } else {
      const updates = fillMissing(existingPublic, DEFAULT_PUBLIC);
      if (Object.keys(updates).length) {
        await SupplierPublicSignal.updateOne({ supplierId: user._id }, { $set: updates });
      }
    }

    const existingMetrics = await SupplierRiskMetrics.findOne({ supplierId: user._id }).lean();
    if (!existingMetrics) {
      await SupplierRiskMetrics.create({ ...DEFAULT_METRICS, supplierId: user._id, updatedBy: user._id });
    } else {
      const updates = fillMissing(existingMetrics, DEFAULT_METRICS);
      if (Object.keys(updates).length) {
        await SupplierRiskMetrics.updateOne({ supplierId: user._id }, { $set: updates });
      }
    }

    await recalculateSupplierRisk({
      supplierId: user._id,
      actorUserId: user._id,
      eventType: "MANUAL_OVERRIDE",
      correlationId: `backfill-risk-${Date.now()}`,
    });

    console.log(`Backfilled risk data for ${email}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
};

main().catch((err) => {
  console.error("seed-risk-suppliers failed", err);
  process.exit(1);
});
