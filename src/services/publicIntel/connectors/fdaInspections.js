import { downloadToBuffer, parseCsvBuffer } from "../utils/download.js";
import { normalizeName, normalizeCountry, makeSiteKey, makeSupplierKey } from "../utils/normalize.js";
import { PublicInspection, PublicSite, PublicSource, PublicSupplier, PublicUnmatched } from "../../../models/publicIntelModels.js";

const SOURCE_NAME = "fdaInspections";

const defaultUrl = () =>
  process.env.PUBLIC_INTEL_FDA_INSPECTIONS_URL ||
  "https://datadashboard.fda.gov/ora/cd/inspections.csv";

const normalizeRow = (row = {}) => {
  const firm = row["Firm Name"] || row["Firm_Name"] || row["FirmName"] || row["Firm"] || "";
  const country = row["Country"] || row["CountryName"] || row["country"] || "";
  const address = [
    row["Address 1"] || row["Street Address"] || row["Street"],
    row["City"],
    row["State"],
    row["Postal Code"],
    country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    firm,
    country,
    address,
    fei: row["FEI Number"] || row["FEI"] || row["FEI_Number"] || "",
    inspectionDate: row["Inspection End Date"] || row["Inspection Date"] || row["InspectionDate"] || row["Date"] || "",
    classification: row["Classification"] || row["Outcome"] || "",
    productType: row["Program Area"] || row["Product Type"] || "",
    raw: row,
  };
};

export const run = async () => {
  const sourceUrl = defaultUrl();
  const { buffer, etag } = await downloadToBuffer(sourceUrl);
  const rows = await parseCsvBuffer(buffer);

  const source = await PublicSource.findOneAndUpdate(
    { name: SOURCE_NAME },
    {
      name: SOURCE_NAME,
      authority: "FDA",
      source_url: sourceUrl,
      format: "csv",
      etag,
      last_run_at: new Date(),
    },
    { upsert: true, new: true }
  );

  let ingested = 0;
  for (const row of rows) {
    const n = normalizeRow(row);
    if (!n.firm) {
      await PublicUnmatched.create({ source_name: SOURCE_NAME, raw_row: row, reason: "missing firm" });
      continue;
    }
    const supplier_key = makeSupplierKey({ name: n.firm, country: n.country });
    const supplier = await PublicSupplier.findOneAndUpdate(
      { supplier_key },
      {
        supplier_key,
        legal_name: n.firm,
        country: normalizeCountry(n.country),
        last_synced_at: new Date(),
        $addToSet: {
          sources: { sourceId: source._id, source_url: source.source_url, retrieved_at: new Date() },
        },
      },
      { upsert: true, new: true }
    );

    const site_key = makeSiteKey({ supplier_key, address: n.address || n.firm });
    const site = await PublicSite.findOneAndUpdate(
      { site_key },
      {
        site_key,
        supplier_id: supplier._id,
        address1: n.address,
        country: normalizeCountry(n.country),
        last_synced_at: new Date(),
        $addToSet: {
          sources: { sourceId: source._id, source_url: source.source_url, retrieved_at: new Date() },
        },
      },
      { upsert: true, new: true }
    );

    await PublicInspection.findOneAndUpdate(
      {
        supplier_id: supplier._id,
        site_id: site._id,
        authority: "FDA",
        inspection_date: n.inspectionDate ? new Date(n.inspectionDate) : null,
        classification: n.classification,
      },
      {
        supplier_id: supplier._id,
        site_id: site._id,
        authority: "FDA",
        inspection_date: n.inspectionDate ? new Date(n.inspectionDate) : null,
        classification: n.classification,
        product_type: n.productType,
        raw: n.raw,
        $addToSet: {
          sources: { sourceId: source._id, source_url: source.source_url, retrieved_at: new Date() },
        },
      },
      { upsert: true }
    );

    ingested += 1;
  }

  source.last_success_at = new Date();
  source.stats = { rows_ingested: ingested };
  await source.save();

  return { rows: rows.length, ingested };
};

export default { name: SOURCE_NAME, run };

