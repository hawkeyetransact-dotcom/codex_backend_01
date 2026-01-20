import XLSX from "xlsx";
import cheerio from "cheerio";
import { ApiMaster } from "../../models/apiMasterModel.js";
import { ApiPublicManufacturers } from "../../models/apiPublicManufacturerModel.js";
import { normalizeApiName, normalizeFirmName } from "../../utils/normalization.js";

const SOURCE_TAG = "FDA_DMF";
const SOURCE_PAGE = "https://www.fda.gov/drugs/drug-master-files-dmfs/drug-master-files-dmfs-listing";

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
  if (h.includes("subject") || h.includes("product") || h.includes("title")) score += 1;
  if (h.includes("company") || h.includes("holder") || h.includes("manufacturer")) score -= 5;
  return score;
};

const scoreTypeHeader = (header) => {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let score = 0;
  if (h === "type" || h.includes("dmftype")) score += 5;
  if (h.includes("type")) score += 2;
  return score;
};

const scoreHolderHeader = (header) => {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let score = 0;
  if (h.includes("holder")) score += 5;
  if (h.includes("company") || h.includes("manufacturer") || h.includes("firm")) score += 3;
  if (h.includes("name")) score += 1;
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

const isTypeIi = (value) => {
  const text = normalizeText(value).toUpperCase();
  if (!text) return false;
  if (text === "II") return true;
  if (text.includes("TYPE II")) return true;
  return /\bII\b/.test(text);
};

const resolveFdaDmfSourceUrl = async () => {
  const explicit = process.env.FDA_DMF_EXCEL_URL || process.env.FDA_DMF_SOURCE_URL || "";
  if (explicit) return explicit;
  const response = await fetch(SOURCE_PAGE);
  if (!response.ok) {
    throw new Error(`FDA DMF page fetch failed (${response.status})`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const candidates = [];
  $("a[href$='.xlsx'], a[href$='.xls']").each((_i, el) => {
    const href = $(el).attr("href");
    const label = $(el).text();
    if (!href) return;
    if (/dmf/i.test(href) || /dmf/i.test(label)) {
      const url = href.startsWith("http") ? href : `https://www.fda.gov${href}`;
      candidates.push(url);
    }
  });
  if (!candidates.length) {
    throw new Error("FDA DMF Excel link not found");
  }
  return candidates[0];
};

const union = (path, values) => ({
  $setUnion: [{ $ifNull: [path, []] }, values],
});

export const ingestFdaDmfTypeIIs = async ({ sourceUrl } = {}) => {
  const resolvedUrl = sourceUrl || (await resolveFdaDmfSourceUrl());
  if (!resolvedUrl) {
    throw new Error("FDA DMF source URL is not configured");
  }
  const startedAt = Date.now();
  const response = await fetch(resolvedUrl);
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
  const typeKey = pickHeader(headers, scoreTypeHeader);
  const holderKey = pickHeader(headers, scoreHolderHeader);

  if (!apiKey) {
    throw new Error("FDA DMF header mapping failed (API name column not found)");
  }

  let skipped = 0;
  const now = new Date();
  const apiMap = new Map();

  for (const row of rows) {
    if (typeKey && !isTypeIi(row[typeKey])) {
      skipped += 1;
      continue;
    }

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
    const holderName = holderKey ? normalizeText(row[holderKey]) : "";

    const entry = apiMap.get(normalizedKey) || {
      normalizedKey,
      canonicalName: apiName,
      dmfNumbers: new Set(),
      casNumbers: new Set(),
      holders: [],
    };
    if (!entry.canonicalName && apiName) entry.canonicalName = apiName;
    if (dmfNumber) entry.dmfNumbers.add(dmfNumber);
    casNumbers.forEach((cas) => entry.casNumbers.add(cas));
    if (holderName && dmfNumber) {
      entry.holders.push({ supplierName: holderName, dmfNumber });
    }
    apiMap.set(normalizedKey, entry);
  }

  if (!apiMap.size) {
    return { parsed, inserted: 0, updated: 0, skipped, durationMs: Date.now() - startedAt };
  }

  const ops = [];
  for (const entry of apiMap.values()) {
    const dmfNumbers = Array.from(entry.dmfNumbers);
    const casNumbers = Array.from(entry.casNumbers);
    const confidenceReasons = [SOURCE_TAG];

    ops.push({
      updateOne: {
        filter: { normalizedKey: entry.normalizedKey },
        update: [
          {
            $setOnInsert: {
              canonicalName: entry.canonicalName,
              normalizedKey: entry.normalizedKey,
              casNumbers: [],
              dmfNumbers: [],
              synonyms: [],
              apiTechnology: "",
              description: "",
              sourceTags: [],
              identifiers: { cas: [], unii: null },
              regulatoryPresence: {
                FDA_DMF: { count: 0, dmfNumbers: [] },
                EDQM_CEP: { count: 0, cepNumbers: [] },
                WHO_PQ: { count: 0, statuses: [] },
              },
              confidence: { score: 0, reasons: [] },
              status: "active",
              firstSeenAt: now,
            },
          },
          {
            $set: {
              firstSeenAt: { $ifNull: ["$firstSeenAt", now] },
              lastSyncedAt: now,
              updatedAt: now,
            },
          },
          {
            $set: {
              sourceTags: union("$sourceTags", [SOURCE_TAG]),
              dmfNumbers: union("$dmfNumbers", dmfNumbers),
              casNumbers: union("$casNumbers", casNumbers),
              "identifiers.cas": union("$identifiers.cas", casNumbers),
              "regulatoryPresence.FDA_DMF.dmfNumbers": union(
                "$regulatoryPresence.FDA_DMF.dmfNumbers",
                dmfNumbers
              ),
              "confidence.reasons": union("$confidence.reasons", confidenceReasons),
            },
          },
          {
            $set: {
              "regulatoryPresence.FDA_DMF.count": {
                $size: { $ifNull: ["$regulatoryPresence.FDA_DMF.dmfNumbers", []] },
              },
              "confidence.score": { $max: ["$confidence.score", 0.5] },
            },
          },
        ],
        upsert: true,
      },
    });
  }

  const result = await ApiMaster.bulkWrite(ops, { ordered: false });
  const inserted = result.upsertedCount || 0;
  const updated = result.modifiedCount || 0;

  const keys = Array.from(apiMap.keys());
  const apiDocs = await ApiMaster.find({ normalizedKey: { $in: keys } })
    .select("_id normalizedKey canonicalName")
    .lean();
  const idMap = new Map(apiDocs.map((doc) => [doc.normalizedKey, doc]));

  const manufacturerOps = [];
  for (const entry of apiMap.values()) {
    const apiDoc = idMap.get(entry.normalizedKey);
    if (!apiDoc) continue;
    entry.holders.forEach((holder) => {
      const supplierKey = normalizeFirmName(holder.supplierName);
      if (!supplierKey) return;
      manufacturerOps.push({
        updateOne: {
          filter: { apiMasterId: apiDoc._id, supplierKey },
          update: {
            $setOnInsert: {
              apiMasterId: apiDoc._id,
              supplierKey,
              supplierName: holder.supplierName,
              lastVerifiedAt: now,
            },
            $set: {
              supplierName: holder.supplierName,
              lastVerifiedAt: now,
            },
            $addToSet: {
              "evidence.dmfNumbers": holder.dmfNumber,
            },
          },
          upsert: true,
        },
      });
    });
  }
  if (manufacturerOps.length) {
    await ApiPublicManufacturers.bulkWrite(manufacturerOps, { ordered: false });
  }

  const insertedIds = Object.values(result.upsertedIds || {}).map((item) => item?._id).filter(Boolean);
  const sample = insertedIds.length
    ? await ApiMaster.find({ _id: { $in: insertedIds } }).select("_id canonicalName normalizedKey").limit(5).lean()
    : [];

  return {
    parsed,
    inserted,
    updated,
    skipped,
    durationMs: Date.now() - startedAt,
    sample,
    sourceUrl: resolvedUrl,
  };
};

export const ingestFdaDmfExcel = ingestFdaDmfTypeIIs;
