import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Blob } from "buffer";

const envName = process.env.APP_ENV || process.env.NODE_ENV || "development";
const explicitPath = process.env.ENV_FILE ? path.resolve(process.cwd(), process.env.ENV_FILE) : null;
const candidates = [
  explicitPath,
  path.resolve(process.cwd(), `.env.${envName}`),
  path.resolve(process.cwd(), ".env"),
].filter(Boolean);

const envPath = candidates.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

if (typeof globalThis.File === "undefined") {
  class File extends Blob {
    constructor(chunks, name = "", options = {}) {
      super(chunks, options);
      this.name = String(name || "");
      this.lastModified = options.lastModified || Date.now();
    }
  }
  globalThis.File = File;
}

export const runtimeEnv = envName;
export const loadedEnvFile = envPath || null;
