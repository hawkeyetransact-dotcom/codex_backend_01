import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { seedGovernanceIfEnabled } from "../src/services/governance/seedGovernance.js";

const run = async () => {
  await connectDatabase();
  await seedGovernanceIfEnabled();
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error("seed_governance failed", err);
  process.exit(1);
});
