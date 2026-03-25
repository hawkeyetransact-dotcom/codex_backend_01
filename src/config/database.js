import mongoose from "mongoose";
import "./loadEnv.js";

let memoryServer = null;
let connectionPromise = null;

const connectWithMemory = async () => {
  // Dynamic import keeps mongodb-memory-server in devDependencies without
  // breaking production builds where devDeps are not installed.
  const { MongoMemoryServer } = await import("mongodb-memory-server");
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
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  try {
    connectionPromise = (async () => {
      if (process.env.USE_MEMORY_DB === "true") {
        await connectWithMemory();
        return mongoose.connection;
      }
      const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error("MONGO_URI is not configured. Set MONGO_URI (or DB_URL/MONGODB_URI) in the environment.");
      }
      // Mask credentials but show DB name so startup logs confirm which DB is active
      const maskedUri = mongoUri.replace(/\/\/[^@]+@/, "//***@");
      console.log(`[DB] Connecting to: ${maskedUri}`);
      await mongoose.connect(mongoUri, {});
      console.log("Database connected");
      return mongoose.connection;
    })();

    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    if (process.env.USE_MEMORY_DB_FALLBACK === "true") {
      await connectWithMemory();
      return mongoose.connection;
    }
    console.error("Database connection failed:", error.message);
    throw error;
  }
};
