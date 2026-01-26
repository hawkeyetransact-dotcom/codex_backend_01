import mongoose from "mongoose";
import dotenv from "dotenv";
import { PublicSupplier } from "../src/models/publicIntelModels.js";

dotenv.config();

const MONGODB_URI = process.env.DEMO_DB_URL || process.env.DEMO_MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing DEMO_DB_URL or DEMO_MONGODB_URI env.");
  process.exit(1);
}

if (process.env.DEMO_SEED !== "1") {
  console.error("Refusing to seed without DEMO_SEED=1.");
  process.exit(1);
}

const SAMPLE_SUPPLIERS = [
  {
    supplier_key: "demo-supplier-06",
    legal_name: "Demo Supplier Six",
    country: "India",
    demoInviteEmail: "supplier6@test.com",
  },
  {
    supplier_key: "demo-supplier-07",
    legal_name: "Demo Supplier Seven",
    country: "United States",
    demoInviteEmail: "supplier7@test.com",
  },
  {
    supplier_key: "demo-supplier-08",
    legal_name: "Demo Supplier Eight",
    country: "Germany",
    demoInviteEmail: "supplier8@test.com",
  },
  {
    supplier_key: "demo-supplier-09",
    legal_name: "Demo Supplier Nine",
    country: "Japan",
    demoInviteEmail: "supplier9@test.com",
  },
  {
    supplier_key: "demo-supplier-10",
    legal_name: "Demo Supplier Ten",
    country: "India",
    demoInviteEmail: "supplier10@test.com",
  },
];

async function run() {
  await mongoose.connect(MONGODB_URI);
  await PublicSupplier.syncIndexes();

  for (const supplier of SAMPLE_SUPPLIERS) {
    await PublicSupplier.findOneAndUpdate(
      { supplier_key: supplier.supplier_key },
      {
        ...supplier,
        claimed_status: "unclaimed",
        last_synced_at: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  console.log(`Seeded ${SAMPLE_SUPPLIERS.length} public suppliers.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("seed_public_suppliers_demo failed", err);
  process.exit(1);
});
