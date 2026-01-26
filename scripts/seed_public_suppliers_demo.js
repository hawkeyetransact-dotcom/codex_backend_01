import mongoose from "mongoose";
import dotenv from "dotenv";
import { PublicSupplier } from "../src/models/publicIntelModels.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URL;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI or DB_URL env.");
  process.exit(1);
}

const SAMPLE_SUPPLIERS = [
  {
    supplier_key: "demo-supplier-01",
    legal_name: "Demo Supplier One",
    country: "India",
  },
  {
    supplier_key: "demo-supplier-02",
    legal_name: "Demo Supplier Two",
    country: "United States",
  },
  {
    supplier_key: "demo-supplier-03",
    legal_name: "Demo Supplier Three",
    country: "Germany",
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
