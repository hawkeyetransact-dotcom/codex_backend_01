import XLSX from "xlsx";
import cheerio from "cheerio";
import { ApiMaster } from "../../models/apiMasterModel.js";
import { ApiPublicManufacturers } from "../../models/apiPublicManufacturerModel.js";
import { normalizeApiName, normalizeFirmName } from "../../utils/normalization.js";

const SOURCE_TAG = "FDA_DMF";
const SOURCE_PAGE = "https://www.fda.gov/drugs/drug-master-files-dmfs/list-drug-master-files-dmfs";

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
  $("a").each((_i, el) => {
    const href = $(el).attr("href");
    const label = $(el).text() || "";
    if (!href) return;
    const lowerHref = href.toLowerCase();
    const lowerLabel = label.toLowerCase();
    const isExcel = lowerHref.endsWith(".xlsx") || lowerHref.endsWith(".xls");
    const isMediaDownload = lowerHref.includes("/media/") && lowerHref.includes("download");
    const isDmfLabel = /dmf/.test(lowerHref) || /dmf/.test(lowerLabel);
    const isExcelLabel = /excel|xlsx|xls/.test(lowerLabel);
    if (isExcel || (isMediaDownload && (isDmfLabel || isExcelLabel))) {
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

const isHeaderRow = (row) => {
  if (!Array.isArray(row)) return false;
  const normalized = row.map((cell) => normalizeHeader(cell));
  const hasDmf = normalized.some((value) => value === "dmf" || value === "dmf#" || value.includes("dmf"));
  const hasType = normalized.some((value) => value === "type" || value.includes("dmftype"));
  const hasHolder = normalized.some((value) => value.includes("holder"));
  const hasSubject = normalized.some((value) => value.includes("subject") || value.includes("api") || value.includes("drugsubstance"));
  return hasDmf && hasType && hasHolder && hasSubject;
};

const resolveHeaderRow = (rows) => {
  const directIndex = rows.findIndex(isHeaderRow);
  if (directIndex >= 0) return directIndex;

  let best = { index: -1, score: 0 };
  rows.forEach((row, index) => {
    if (!Array.isArray(row)) return;
    const headers = row.map((cell) => String(cell || "").trim());
    const score =
      headers.reduce((sum, header) => sum + scoreDmfHeader(header), 0) +
      headers.reduce((sum, header) => sum + scoreTypeHeader(header), 0) +
      headers.reduce((sum, header) => sum + scoreApiHeader(header), 0) +
      headers.reduce((sum, header) => sum + scoreHolderHeader(header), 0);
    if (score > best.score) {
      best = { index, score };
    }
  });
  return best.index;
};

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
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = resolveHeaderRow(rawRows);
  if (headerIndex < 0) {
    throw new Error("FDA DMF header mapping failed (header row not found)");
  }
  const rawHeader = rawRows[headerIndex] || [];
  const headers = rawHeader.map((cell, idx) => {
    const text = normalizeText(cell);
    return text || `__EMPTY_${idx}`;
  });
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: headers, range: headerIndex + 1 });
  const parsed = rows.length;
  if (!parsed) {
    return { parsed: 0, inserted: 0, updated: 0, skipped: 0, durationMs: Date.now() - startedAt };
  }

  const headerKeys = Object.keys(rows[0] || {});
  const apiKey = pickHeader(headerKeys, scoreApiHeader);
  const dmfKey = pickHeader(headerKeys, scoreDmfHeader);
  const casKey = pickHeader(headerKeys, scoreCasHeader);
  const typeKey = pickHeader(headerKeys, scoreTypeHeader);
  const holderKey = pickHeader(headerKeys, scoreHolderHeader);

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
    const update = {
      $setOnInsert: {
        canonicalName: entry.canonicalName,
        normalizedKey: entry.normalizedKey,
        synonyms: [],
        apiTechnology: "",
        description: "",
        status: "active",
        firstSeenAt: now,
      },
      $set: {
        lastSyncedAt: now,
        updatedAt: now,
      },
      $addToSet: {
        sourceTags: SOURCE_TAG,
        "confidence.reasons": { $each: confidenceReasons },
        dmfNumbers: { $each: dmfNumbers },
        casNumbers: { $each: casNumbers },
        "identifiers.cas": { $each: casNumbers },
        "regulatoryPresence.FDA_DMF.dmfNumbers": { $each: dmfNumbers },
      },
      $max: {
        "regulatoryPresence.FDA_DMF.count": dmfNumbers.length,
        "confidence.score": 0.5,
      },
    };

    ops.push({
      updateOne: {
        filter: { normalizedKey: entry.normalizedKey },
        update,
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
