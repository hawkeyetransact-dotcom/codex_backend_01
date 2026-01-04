import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import csvParser from "csv-parser";

export const downloadToBuffer = async (url, { retries = 3, timeoutMs = 20000 } = {}) => {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf, contentType: res.headers.get("content-type") || "", etag: res.headers.get("etag") || "" };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
};

export const parseCsvBuffer = async (buffer) =>
  new Promise((resolve, reject) => {
    const rows = [];
    try {
      const tmpPath = path.join(process.cwd(), "tmp-public-csv-" + Date.now() + ".csv");
      fs.writeFileSync(tmpPath, buffer);
      fs.createReadStream(tmpPath)
        .pipe(csvParser())
        .on("data", (data) => rows.push(data))
        .on("end", () => {
          fs.unlink(tmpPath, () => {});
          resolve(rows);
        })
        .on("error", (err) => {
          fs.unlink(tmpPath, () => {});
          reject(err);
        });
    } catch (err) {
      reject(err);
    }
  });

export const saveBufferToFile = async (buffer, targetPath) => {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buffer);
  return targetPath;
};
