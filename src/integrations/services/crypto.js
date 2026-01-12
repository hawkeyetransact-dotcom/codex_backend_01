import crypto from "crypto";

const getKey = () => {
  const secret = process.env.INTEGRATION_SECRET_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("INTEGRATION_SECRET_KEY is required to encrypt credentials.");
  }
  return crypto.createHash("sha256").update(secret).digest();
};

export const encryptSecret = (value) => {
  if (value === undefined || value === null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  });
};

export const decryptSecret = (payload) => {
  if (!payload) return null;
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const key = getKey();
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const data = Buffer.from(parsed.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(decoded);
};
