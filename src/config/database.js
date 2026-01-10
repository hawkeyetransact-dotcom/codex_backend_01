import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import "./loadEnv.js";

let memoryServer = null;

const connectWithMemory = async () => {
  if (!memoryServer) {
    memoryServer = await MongoMemoryServer.create({
      instance: { dbName: process.env.MONGO_DB_NAME || "hawkeye_test" },
    });
  }
  const uri = memoryServer.getUri();
  await mongoose.connect(uri, {});
  console.log("Database connected (memory)");
};

export const connectDatabase = async () => {
  try {
    if (process.env.USE_MEMORY_DB === "true") {
      await connectWithMemory();
      return;
    }
    const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI is not configured. Set MONGO_URI (or DB_URL/MONGODB_URI) in the environment.");
    }
    await mongoose.connect(mongoUri, {});
    console.log("Database connected");
  } catch (error) {
    if (process.env.USE_MEMORY_DB_FALLBACK === "true") {
      await connectWithMemory();
      return;
    }
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};
