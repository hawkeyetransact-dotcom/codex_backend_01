import { ApiMaster } from "../models/apiMasterModel.js";
import { ApiMasterSync } from "../models/apiMasterSyncModel.js";
import { ingestFdaDmfTypeIIs } from "../services/apiMasterIngest/fdaDmfIngest.js";
import { normalizeApiName } from "../utils/normalization.js";

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SOURCE_KEY = "FDA_DMF";
const SOURCE_NAME = "FDA DMF Type II";
const DEFAULT_COOLDOWN_HOURS = Number(process.env.API_MASTER_REFRESH_COOLDOWN_HOURS || 24);
const DEFAULT_LOCK_MS = 15 * 60 * 1000;

export const searchApiMaster = async (req, res) => {
  try {
    const { q = "", cas = "" } = req.query;
    const normalizedQuery = q ? normalizeApiName(String(q)) : "";
    const rawRegex = q ? new RegExp(escapeRegex(String(q)), "i") : null;
    const normalizedRegex = normalizedQuery ? new RegExp(escapeRegex(normalizedQuery), "i") : null;
    const filters = [];

    if (normalizedQuery) {
      filters.push({ normalizedKey: normalizedRegex });
    }
    if (rawRegex) {
      filters.push({ canonicalName: rawRegex });
      filters.push({ synonyms: rawRegex });
    }
    if (cas) {
      filters.push({ casNumbers: String(cas) });
      filters.push({ "identifiers.cas": String(cas) });
    }

    const statusFilter = { status: { $ne: "deprecated" } };
    const query = filters.length ? { $and: [{ $or: filters }, statusFilter] } : statusFilter;
    const results = await ApiMaster.find(query).sort({ canonicalName: 1 }).limit(25).lean();
    return res.json({ success: true, data: results });
  } catch (error) {
    console.error("searchApiMaster error", error);
    return res.status(500).json({ error: "Failed to search API master" });
  }
};

export const listApiMaster = async (req, res) => {
  try {
    const { letter, limit = 200, skip = 0 } = req.query;
    const safeLimit = Math.min(Number(limit) || 200, 500);
    const safeSkip = Math.max(Number(skip) || 0, 0);
    const match = { status: { $ne: "deprecated" } };
    const letterValue = String(letter || "").trim().toUpperCase();

    if (letterValue === "#") {
      match.canonicalName = { $not: /^[A-Z]/i };
    } else if (/^[A-Z]$/.test(letterValue)) {
      match.canonicalName = new RegExp(`^${escapeRegex(letterValue)}`, "i");
    }

    const [items, count] = await Promise.all([
      ApiMaster.find(match)
        .sort({ canonicalName: 1 })
        .skip(safeSkip)
        .limit(safeLimit)
        .select("_id canonicalName identifiers casNumbers sourceTags regulatoryPresence confidence lastSyncedAt updatedAt")
        .lean(),
      ApiMaster.countDocuments(match),
    ]);

    return res.json({ count, items });
  } catch (error) {
    console.error("listApiMaster error", error);
    return res.status(500).json({ error: "Failed to list API master records" });
  }
};

export const listApiMasterLetters = async (req, res) => {
  try {
    const bucketRegex = new RegExp("^[A-Z]$");
    const counts = {};
    for (let i = 65; i <= 90; i += 1) {
      counts[String.fromCharCode(i)] = 0;
    }
    counts["#"] = 0;

    const agg = await ApiMaster.aggregate([
      { $match: { status: { $ne: "deprecated" } } },
      {
        $project: {
          firstChar: {
            $toUpper: {
              $substrCP: ["$canonicalName", 0, 1],
            },
          },
        },
      },
      {
        $project: {
          bucket: {
            $cond: [{ $regexMatch: { input: "$firstChar", regex: bucketRegex } }, "$firstChar", "#"],
          },
        },
      },
      { $group: { _id: "$bucket", count: { $sum: 1 } } },
    ]);

    agg.forEach((row) => {
      counts[row._id] = row.count;
    });

    return res.json(counts);
  } catch (error) {
    console.error("listApiMasterLetters error", error);
    return res.status(500).json({ error: "Failed to load API master letters" });
  }
};

export const getApiMasterStatus = async (req, res) => {
  try {
    const [syncDoc, totalCount, lastUpdated] = await Promise.all([
      ApiMasterSync.findById(SOURCE_KEY).lean(),
      ApiMaster.countDocuments({}),
      ApiMaster.aggregate([
        {
          $group: {
            _id: null,
            maxUpdatedAt: { $max: "$updatedAt" },
            maxSyncedAt: { $max: "$lastSyncedAt" },
          },
        },
      ]),
    ]);

    const source = syncDoc || {
      _id: SOURCE_KEY,
      sourceName: SOURCE_NAME,
      sourceUrl: process.env.FDA_DMF_EXCEL_URL || process.env.FDA_DMF_SOURCE_URL || "",
      status: "idle",
      stats: {},
      last_success_at: null,
    };

    const lastUpdatedAt =
      lastUpdated?.[0]?.maxSyncedAt ||
      lastUpdated?.[0]?.maxUpdatedAt ||
      null;
    const lastSuccessAt = source.lastSuccessAt || source.last_success_at || null;

    return res.json({
      sources: [
        {
          sourceKey: source._id,
          sourceName: source.sourceName || SOURCE_NAME,
          sourceUrl: source.sourceUrl || process.env.FDA_DMF_EXCEL_URL || process.env.FDA_DMF_SOURCE_URL || "",
          lastSuccessAt,
          last_success_at: lastSuccessAt,
          status: source.status || "idle",
          stats: source.stats || {},
        },
      ],
      apiMaster: {
        totalCount,
        lastUpdatedAt,
      },
    });
  } catch (error) {
    console.error("getApiMasterStatus error", error);
    return res.status(500).json({ error: "Failed to load API master status" });
  }
};

export const refreshApiMaster = async (req, res) => {
  const now = new Date();
  const { sources, force } = req.body || {};
  const requested = Array.isArray(sources) && sources.length ? sources : [SOURCE_KEY];
  const forceRefresh = force === true || force === "true";

  if (requested.length !== 1 || requested[0] !== SOURCE_KEY) {
    return res.status(400).json({ error: "Only FDA_DMF refresh is supported" });
  }

  try {
    const sourceKey = requested[0];
    const existing = await ApiMasterSync.findById(sourceKey).lean();
    if (existing?.status === "running" || (existing?.lockUntil && existing.lockUntil > now)) {
      return res.status(409).json({ error: "Refresh already running" });
    }

    const cooldownMs = DEFAULT_COOLDOWN_HOURS * 60 * 60 * 1000;
    const lastSuccessAt = existing?.lastSuccessAt || existing?.last_success_at || null;
    if (!forceRefresh && lastSuccessAt && now - lastSuccessAt < cooldownMs) {
      return res.status(429).json({
        error: "Already refreshed recently",
        last_success_at: lastSuccessAt,
        lastSuccessAt,
      });
    }

    const lockUntil = new Date(now.getTime() + DEFAULT_LOCK_MS);
    const sourceUrl = existing?.sourceUrl || process.env.FDA_DMF_EXCEL_URL || process.env.FDA_DMF_SOURCE_URL || "";
    await ApiMasterSync.findByIdAndUpdate(
      sourceKey,
      {
        _id: sourceKey,
        sourceName: existing?.sourceName || SOURCE_NAME,
        sourceUrl,
        status: "running",
        lastRunAt: now,
        last_run_at: now,
        lockUntil,
        error: { message: "", at: null },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const stats = await ingestFdaDmfTypeIIs({ sourceUrl });
    const syncStats = {
      parsed: stats?.parsed || 0,
      inserted: stats?.inserted || 0,
      updated: stats?.updated || 0,
      skipped: stats?.skipped || 0,
    };
    const updatedDoc = await ApiMasterSync.findByIdAndUpdate(
      sourceKey,
      {
        status: "success",
        lastSuccessAt: new Date(),
        last_success_at: new Date(),
        stats: syncStats,
        lockUntil: null,
        error: { message: "", at: null },
      },
      { new: true }
    );

    return res.json({
      ok: true,
      lastSuccessAt: updatedDoc?.lastSuccessAt || updatedDoc?.last_success_at || null,
      last_success_at: updatedDoc?.lastSuccessAt || updatedDoc?.last_success_at || null,
      stats: updatedDoc?.stats || syncStats,
      sample: stats?.sample || [],
    });
  } catch (error) {
    console.error("refreshApiMaster error", error);
    await ApiMasterSync.findByIdAndUpdate(
      SOURCE_KEY,
      {
        status: "failed",
        lockUntil: null,
        error: { message: error.message || "Failed to refresh", at: new Date() },
      },
      { upsert: true }
    );
    return res.status(500).json({ error: error.message || "Failed to refresh API master" });
  }
};
