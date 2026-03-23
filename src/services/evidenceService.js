import fs from "fs";
import path from "path";
import crypto from "crypto";
import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";
import Evidence from "../models/evidenceModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";

const uploadDir = path.join(process.cwd(), "uploads", "evidence");
const ensureDir = (p) => { try { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); } catch (_) {} };
ensureDir(uploadDir);
ensureDir(path.join(uploadDir, "original"));
ensureDir(path.join(uploadDir, "redacted"));

const detectPII = (text) => {
  const patterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, // ssn-like
    /\b\d{10}\b/g, // 10 digit phone
  ];
  const findings = new Set();
  patterns.forEach((re) => {
    const matches = text.match(re);
    if (matches) matches.forEach((m) => findings.add(m));
  });
  return Array.from(findings);
};

const redactText = (text, findings) => {
  let redacted = text;
  findings.forEach((item) => {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(escaped, "g"), "[REDACTED]");
  });
  return redacted;
};

const encryptBuffer = (buf) => {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { data: Buffer.concat([enc, tag]), key: key.toString("base64"), iv: iv.toString("base64"), alg: "aes-256-gcm" };
};

const decryptBuffer = (buf, keyB64, ivB64) => {
  const key = Buffer.from(keyB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = buf.slice(buf.length - 16);
  const data = buf.slice(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

const extractTextFromBuffer = async (file) => {
  try {
    if (file.mimetype === "application/pdf") {
      const parsed = await pdfParse(file.buffer);
      return parsed.text || "";
    }
    if (file.mimetype?.startsWith("text/")) {
      return file.buffer.toString("utf8");
    }
    if (file.mimetype?.startsWith("image/")) {
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(file.buffer);
      await worker.terminate();
      return data?.text || "";
    }
  } catch (err) {
    console.error("[evidence] extractText error", err.message);
  }
  return "";
};

export const EvidenceService = {
  async createFromUpload({ file, uploaderId, uploaderRole, auditRequestId, tenantId }) {
    const audit = await AuditRequestMaster.findById(auditRequestId);
    if (!audit) throw new Error("Audit request not found");

    const evidence = await Evidence.create({
      tenantId,
      auditRequestId,
      uploaderId,
      uploaderRole,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      status: "processing",
      viewPolicy: { ttlMinutes: 30, maxViews: 3 },
    });

    try {
      const originalEncrypted = encryptBuffer(file.buffer);
      const originalPath = path.join(uploadDir, "original", `${evidence._id}.enc`);
      fs.writeFileSync(originalPath, originalEncrypted.data);

      const textContent = await extractTextFromBuffer(file);
      const findings = textContent ? detectPII(textContent) : [];
      const redactedText = textContent ? redactText(textContent, findings) : "Redacted preview unavailable for this file type.";
      const redactedBuf = Buffer.from(redactedText, "utf8");
      const redactedEncrypted = encryptBuffer(redactedBuf);
      const redactedPath = path.join(uploadDir, "redacted", `${evidence._id}.enc`);
      fs.writeFileSync(redactedPath, redactedEncrypted.data);

      evidence.originalPath = originalPath;
      evidence.redactedPath = redactedPath;
      evidence.encryption = { alg: "aes-256-gcm", key: redactedEncrypted.key, iv: redactedEncrypted.iv };
      evidence.piiFindings = findings;
      evidence.status = "ready";
      await evidence.save();
      return evidence;
    } catch (err) {
      evidence.status = "failed";
      evidence.failedReason = err.message;
      await evidence.save();
      throw err;
    }
  },

  async issueViewToken({ evidenceId, viewerId, tenantId, jwtSign }) {
    const evidence = await Evidence.findOne({ _id: evidenceId, tenantId, status: "ready" });
    if (!evidence) throw new Error("Evidence not found");
    const ttl = (evidence.viewPolicy?.ttlMinutes || 30) * 60;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const jti = crypto.randomUUID();
    const token = jwtSign({ evidenceId: String(evidence._id), tenantId: String(tenantId), viewerId: String(viewerId), jti }, { expiresIn: `${ttl}s` });
    evidence.viewSessions = (evidence.viewSessions || []).slice(-10);
    evidence.viewSessions.push({ jti, expiresAt: new Date(exp * 1000), revoked: false });
    await evidence.save();
    return { token, expiresAt: exp * 1000, jti };
  },

  async streamRedacted({ evidenceId, tenantId, tokenValidated }) {
    const evidence = await Evidence.findOne({ _id: evidenceId, tenantId, status: "ready" });
    if (!evidence) throw new Error("Evidence not found");
    if (evidence.viewPolicy?.maxViews && evidence.viewCount >= evidence.viewPolicy.maxViews) {
      throw new Error("View limit reached");
    }
    const session = (evidence.viewSessions || []).find((s) => s.jti === tokenValidated?.jti);
    if (!session || session.revoked || (session.expiresAt && session.expiresAt < new Date())) {
      throw new Error("Token revoked or expired");
    }
    const encData = fs.readFileSync(evidence.redactedPath);
    const buf = decryptBuffer(encData, evidence.encryption.key, evidence.encryption.iv);
    evidence.viewCount += 1;
    evidence.lastViewedAt = new Date();
    await evidence.save();
    return { buffer: buf, mimeType: "text/plain" };
  },

  async revokeToken({ evidenceId, tenantId, jti }) {
    const evidence = await Evidence.findOne({ _id: evidenceId, tenantId, status: "ready" });
    if (!evidence) throw new Error("Evidence not found");
    const session = (evidence.viewSessions || []).find((s) => s.jti === jti);
    if (session) {
      session.revoked = true;
      await evidence.save();
    }
    return true;
  },

  async listByAudit({ auditRequestId, tenantId }) {
    return Evidence.find({ auditRequestId, tenantId }).sort({ createdAt: -1 }).lean();
  },
};
