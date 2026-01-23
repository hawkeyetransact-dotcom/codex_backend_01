import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import Tenant from "../src/models/tenantModel.js";
import { TenantModuleConfig } from "../src/models/tenantModuleConfigModel.js";

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

const run = async () => {
  await connectDatabase();
  console.log("Starting backfill_tenant_module_config", { dryRun, limit });

  const tenants = await Tenant.find().limit(limit || 0).lean();
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const existing = await TenantModuleConfig.findOne({ tenantId: tenant._id }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }
    if (!dryRun) {
      await TenantModuleConfig.create({
        tenantId: tenant._id,
        enabledModules: ["cGMP"],
        defaultModule: "cGMP",
        moduleSettings: {},
      });
    }
    created += 1;
  }

  console.log("Backfill complete", { created, skipped });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
