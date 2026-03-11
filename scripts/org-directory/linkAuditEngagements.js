import "../../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../../src/config/database.js";
import { OrganizationBackfillService } from "../../src/services/orgDirectory/organizationBackfillService.js";

const args = process.argv.slice(2);
const apply = args.includes("--commit");
const tenantArg = args.find((arg) => arg.startsWith("--tenantId="));
const tenantId = tenantArg ? tenantArg.split("=")[1] : null;

const main = async () => {
  await connectDatabase();
  const result = await OrganizationBackfillService.linkAuditEngagements({ apply, tenantId });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
