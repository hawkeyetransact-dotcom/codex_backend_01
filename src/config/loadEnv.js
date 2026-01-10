import dotenv from "dotenv";
import fs from "fs";
import path from "path";

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

export const runtimeEnv = envName;
export const loadedEnvFile = envPath || null;
