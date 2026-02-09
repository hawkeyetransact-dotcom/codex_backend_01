import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import Tenant from "../src/models/tenantModel.js";
import { LOCAL_KB_PRODUCT_AREA, LOCAL_KB_SOURCE, syncKnowledgeIndexToTenantKb } from "../src/services/askHawkKnowledgeService.js";

const parseArg = (flag, fallback = "") => {
  const idx = process.argv.findIndex((arg) => arg === flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
};

const parseListArg = (flag) => {
  const raw = parseArg(flag, "");
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const run = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  const tenantArg = parseArg("--tenant", "");
  const roles = parseListArg("--roles");
  const productArea = parseArg("--product-area", LOCAL_KB_PRODUCT_AREA);
  const maxArticles = Number(parseArg("--max-articles", "280"));
  const maxChunksPerArticle = Number(parseArg("--max-chunks", "6"));

  await mongoose.connect(mongoUri);

  const tenantFilter = tenantArg
    ? { _id: tenantArg }
    : {};
  const tenants = await Tenant.find(tenantFilter).select("_id displayName name").lean();
  if (!tenants.length) {
    console.log("No tenants found for AskHawk KB sync.");
    await mongoose.disconnect();
    return;
  }

  const defaultRoles = ["BUYER", "AUDITOR", "SUPPLIER", "SUPPLIERUSER", "TENANT_ADMIN"];
  const targetRoles = roles.length ? roles : defaultRoles;

  console.log(`Starting AskHawk KB sync from local code. source=${LOCAL_KB_SOURCE}`);
  for (const tenant of tenants) {
    const tenantId = String(tenant._id);
    const tenantName = tenant.displayName || tenant.name || tenantId;
    for (const role of targetRoles) {
      const result = await syncKnowledgeIndexToTenantKb({
        tenantId,
        role,
        productArea,
        maxArticles,
        maxChunksPerArticle,
      });
      console.log(
        `Synced tenant=${tenantName} role=${role} articles=${result.articles} chunks=${result.chunks}`
      );
    }
  }

  await mongoose.disconnect();
  console.log("AskHawk KB sync complete.");
};

run().catch(async (error) => {
  console.error("seed_askhawk_kb_from_codebase failed", error);
  try {
    await mongoose.disconnect();
  } catch (_err) {
    // no-op
  }
  process.exit(1);
});

