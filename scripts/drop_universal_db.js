/**
 * drop_universal_db.js
 *
 * SAFETY: Refuses to run if DB_NAME does not contain "universal".
 * This prevents accidental drops of the production or dev DB.
 *
 * Run via: npm run db:universal:drop
 */

import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.universal") });

const run = async () => {
  const dbName = process.env.DB_NAME ?? "";
  if (!dbName.includes("universal")) {
    console.error('[DROP] REFUSED: DB_NAME does not contain "universal". Aborting.');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not defined in .env.universal");

  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  console.log(`[DROP] ✓ Database "${dbName}" dropped.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
