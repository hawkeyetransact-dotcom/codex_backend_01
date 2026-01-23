import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import Tenant from "../src/models/tenantModel.js";
import { TenantModuleConfig } from "../src/models/tenantModuleConfigModel.js";
import { AUDIT_MODULES } from "../src/modules/auditEngine/constants.js";
import { ComplianceStandard } from "../src/models/complianceStandardModel.js";

const argValue = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const tenantName = argValue("--tenant", undefined);

const run = async () => {
  await connectDatabase();
  console.log("Seeding assessment demo config", { tenantName });

  const tenant = tenantName
    ? await Tenant.findOne({ name: tenantName }).lean()
    : await Tenant.findOne({}).lean();

  if (!tenant) {
    console.error("No tenant found");
    await mongoose.connection.close();
    process.exit(1);
  }

  const config = await TenantModuleConfig.findOneAndUpdate(
    { tenantId: tenant._id },
    { enabledModules: AUDIT_MODULES, defaultModule: "cGMP" },
    { new: true, upsert: true }
  );

  await ComplianceStandard.findOneAndUpdate(
    { tenantId: tenant._id, standardId: "ISO9001" },
    {
      tenantId: tenant._id,
      standardId: "ISO9001",
      name: "ISO 9001",
      version: "2015",
      domain: "QUALITY",
      clauses: [
        { clauseId: "4.1", title: "Understanding the organization", text: "" },
        { clauseId: "6.1", title: "Actions to address risks", text: "" },
      ],
    },
    { upsert: true }
  );

  console.log("Seed complete", { tenant: tenant.name, enabledModules: config.enabledModules });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
