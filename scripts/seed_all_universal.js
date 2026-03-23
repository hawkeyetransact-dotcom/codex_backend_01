/**
 * seed_all_universal.js
 *
 * Seeds the hawkeye_universal_dev database in order:
 * 1. Runs workflow definition seeds
 * 2. Runs module config seeds (industry profiles per tenant)
 *
 * Run via: npm run seed:universal
 */

import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.universal") });

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not defined in .env.universal");

  await mongoose.connect(uri);
  console.log(`[SEED] Connected to: ${process.env.DB_NAME ?? "hawkeye_universal_dev"}`);

  // ── Step 1: Workflow definitions ───────────────────────────────────────────
  const { seedWorkflowDefinitions } = await import("./seed_workflow_definitions.js");
  await seedWorkflowDefinitions();
  console.log("[SEED] ✓ Workflow definitions seeded");

  // ── Step 2: Module configs per tenant ─────────────────────────────────────
  const { seedModuleConfigs } = await import("./seed_module_configs.js");
  await seedModuleConfigs();
  console.log("[SEED] ✓ Module configs seeded");

  await mongoose.disconnect();
  console.log("[SEED] ✓ Complete. Database hawkeye_universal_dev is ready.");
};

run().catch((err) => {
  console.error("[SEED] Fatal error:", err);
  process.exit(1);
});
