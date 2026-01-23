import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import Tenant from "../src/models/tenantModel.js";
import { AuditCycleTemplate } from "../src/models/auditCycleTemplateModel.js";
import { MODULE_PACKS } from "../src/modules/auditEngine/modulePacks.js";

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
  console.log("Starting seed_audit_cycle_templates", { dryRun, limit });

  const tenants = await Tenant.find().limit(limit || 0).lean();
  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    for (const pack of Object.values(MODULE_PACKS)) {
      const existing = await AuditCycleTemplate.findOne({ tenantId: tenant._id, module: pack.module }).lean();
      if (existing) {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        await AuditCycleTemplate.create({
          tenantId: tenant._id,
          templateId: `DEFAULT_${pack.module}`,
          module: pack.module,
          name: `${pack.label} Default Cycle`,
          phases: pack.phases,
          rules: {},
        });
      }
      created += 1;
    }
  }

  console.log("Seed complete", { created, skipped });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
