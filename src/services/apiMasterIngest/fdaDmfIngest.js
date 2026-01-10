import XLSX from "xlsx";
import { ApiMaster } from "../../models/apiMasterModel.js";
import { normalizeApiName } from "../../utils/normalization.js";

const SOURCE_TAG = "FDA_DMF";

const normalizeHeader = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const scoreDmfHeader = (header) => {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let score = 0;
  if (h.includes("dmf")) score += 5;
  if (h.includes("number") || h.includes("no") || h.includes("num")) score += 2;
  return score;
};

const scoreCasHeader = (header) => {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let score = 0;
  if (h.includes("cas")) score += 5;
  if (h.includes("number") || h.includes("no") || h.includes("num")) score += 2;
  return score;
};

const scoreApiHeader = (header) => {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let score = 0;
  if (h.includes("drug") && h.includes("substance")) score += 6;
  if (h.includes("active") && h.includes("ingredient")) score += 5;
  if (h.includes("apiname") || h === "api") score += 4;
  if (h.includes("api")) score += 3;
  if (h.includes("substance")) score += 2;
  if (h.includes("subject") || h.includes("product")) score += 1;
  if (h.includes("company") || h.includes("holder") || h.includes("manufacturer")) score -= 5;
  return score;
};

const pickHeader = (headers, scoreFn) => {
  let best = { key: null, score: 0 };
  headers.forEach((header) => {
    const score = scoreFn(header);
    if (score > best.score) {
      best = { key: header, score };
    }
  });
  return best.key;
};

const normalizeText = (value) => String(value ?? "").trim();

const parseCasNumbers = (value) => {
  const raw = normalizeText(value);
  if (!raw) return [];
  return raw
    .split(/[;,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
};

const bulkApply = async (ops) => {
  if (!ops.length) return { inserted: 0, updated: 0 };
  const result = await ApiMaster.bulkWrite(ops, { ordered: false });
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
};

export const ingestFdaDmfExcel = async ({ sourceUrl } = {}) => {
  if (!sourceUrl) {
    throw new Error("FDA_DMF_SOURCE_URL is not configured");
  }
  const startedAt = Date.now();
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`FDA DMF download failed (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    throw new Error("FDA DMF workbook has no sheets");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const parsed = rows.length;
  if (!parsed) {
    return { parsed: 0, inserted: 0, updated: 0, skipped: 0, durationMs: Date.now() - startedAt };
  }

  const headers = Object.keys(rows[0] || {});
  const apiKey = pickHeader(headers, scoreApiHeader);
  const dmfKey = pickHeader(headers, scoreDmfHeader);
  const casKey = pickHeader(headers, scoreCasHeader);

  if (!apiKey) {
    throw new Error("FDA DMF header mapping failed (API name column not found)");
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date();
  const ops = [];

  const flush = async () => {
    const result = await bulkApply(ops.splice(0, ops.length));
    inserted += result.inserted;
    updated += result.updated;
  };

  for (const row of rows) {
    const apiName = normalizeText(row[apiKey]);
    if (!apiName) {
      skipped += 1;
      continue;
    }
    const normalizedKey = normalizeApiName(apiName);
    if (!normalizedKey) {
      skipped += 1;
      continue;
    }
    const dmfNumber = dmfKey ? normalizeText(row[dmfKey]) : "";
    const casNumbers = casKey ? parseCasNumbers(row[casKey]) : [];

    const addToSet = { sourceTags: SOURCE_TAG };
    if (dmfNumber) addToSet.dmfNumbers = dmfNumber;
    if (casNumbers.length) addToSet.casNumbers = { $each: casNumbers };

    ops.push({
      updateOne: {
        filter: { normalizedKey },
        update: {
          $setOnInsert: {
            canonicalName: apiName,
            normalizedKey,
            casNumbers: [],
            synonyms: [],
            apiTechnology: "",
            description: "",
          },
          $addToSet: addToSet,
          $set: { updatedAt: now },
        },
        upsert: true,
      },
    });

    if (ops.length >= 500) {
      await flush();
    }
  }

  if (ops.length) {
    await flush();
  }

  return {
    parsed,
    inserted,
    updated,
    skipped,
    durationMs: Date.now() - startedAt,
  };
};
