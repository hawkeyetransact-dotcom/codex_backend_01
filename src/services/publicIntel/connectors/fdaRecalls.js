import fetch from "node-fetch";
import { normalizeCountry, makeSupplierKey } from "../utils/normalize.js";
import { PublicAction, PublicSource, PublicSupplier, PublicUnmatched } from "../../../models/publicIntelModels.js";

const SOURCE_NAME = "fdaRecalls";
const BASE_URL = "https://api.fda.gov/drug/enforcement.json";

const fetchPage = async (skip, limit) => {
  const url = `${BASE_URL}?limit=${limit}&skip=${skip}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FDA recalls HTTP ${res.status}`);
  return res.json();
};

export const run = async () => {
  const source = await PublicSource.findOneAndUpdate(
    { name: SOURCE_NAME },
    {
      name: SOURCE_NAME,
      authority: "FDA",
      source_url: BASE_URL,
      format: "json",
      last_run_at: new Date(),
    },
    { upsert: true, new: true }
  );

  let ingested = 0;
  let skip = 0;
  const limit = 100;
  let total = null;

  while (total === null || skip < total) {
    const page = await fetchPage(skip, limit);
    total = page.meta?.results?.total || 0;
    const results = page.results || [];
    if (!results.length) break;

    for (const row of results) {
      const firm = row.recalling_firm || "";
      if (!firm) {
        await PublicUnmatched.create({ source_name: SOURCE_NAME, raw_row: row, reason: "missing firm" });
        continue;
      }
      const supplier_key = makeSupplierKey({ name: firm, country: row.country || "" });
      const supplier = await PublicSupplier.findOneAndUpdate(
        { supplier_key },
        {
          supplier_key,
          legal_name: firm,
          country: normalizeCountry(row.country || ""),
          last_synced_at: new Date(),
          $addToSet: {
            sources: { sourceId: source._id, source_url: source.source_url, retrieved_at: new Date() },
          },
        },
        { upsert: true, new: true }
      );

      await PublicAction.findOneAndUpdate(
        {
          type: "Recall",
          authority: "FDA",
          supplier_id: supplier._id,
          date: row.report_date ? new Date(row.report_date) : null,
          title: row.product_description || "",
        },
        {
          type: "Recall",
          authority: "FDA",
          supplier_id: supplier._id,
          status: row.status,
          date: row.report_date ? new Date(row.report_date) : null,
          title: row.product_description || row.reason_for_recall || "",
          url: row.more_code_info || row.voluntary_mandated || "",
          raw: row,
          $addToSet: {
            sources: { sourceId: source._id, source_url: source.source_url, retrieved_at: new Date() },
          },
        },
        { upsert: true }
      );
      ingested += 1;
    }

    skip += limit;
  }

  source.last_success_at = new Date();
  source.stats = { rows_ingested: ingested };
  await source.save();

  return { ingested };
};

export default { name: SOURCE_NAME, run };

