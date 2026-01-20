import mongoose from "mongoose";
import { ApiMaster } from "../src/models/apiMasterModel.js";
import { ApiPublicManufacturers } from "../src/models/apiPublicManufacturerModel.js";

const buildDefaults = () => ({
  identifiers: { cas: [], unii: null },
  regulatoryPresence: {
    FDA_DMF: { count: 0, dmfNumbers: [] },
    EDQM_CEP: { count: 0, cepNumbers: [] },
    WHO_PQ: { count: 0, statuses: [] },
  },
  confidence: { score: 0, reasons: [] },
});

export const runMigration = async ({ createIndexes = true } = {}) => {
  const ops = [];
  let scanned = 0;
  let updated = 0;

  const cursor = ApiMaster.find({}).cursor();
  for await (const doc of cursor) {
    scanned += 1;
    const updates = {};
    const defaults = buildDefaults();

    if (!doc.identifiers) {
      updates.identifiers = defaults.identifiers;
    }
    if (Array.isArray(doc.casNumbers) && doc.casNumbers.length) {
      const existingCas = doc.identifiers?.cas || [];
      if (!existingCas.length) {
        updates["identifiers.cas"] = doc.casNumbers;
      }
    }

    if (!doc.regulatoryPresence) {
      updates.regulatoryPresence = defaults.regulatoryPresence;
    }
    if (Array.isArray(doc.dmfNumbers) && doc.dmfNumbers.length) {
      const existingDmf = doc.regulatoryPresence?.FDA_DMF?.dmfNumbers || [];
      if (!existingDmf.length) {
        updates["regulatoryPresence.FDA_DMF.dmfNumbers"] = doc.dmfNumbers;
        updates["regulatoryPresence.FDA_DMF.count"] = doc.dmfNumbers.length;
      }
    }

    if (!doc.confidence) {
      updates.confidence = defaults.confidence;
    }
    if (!doc.firstSeenAt) {
      updates.firstSeenAt = doc.createdAt || new Date();
    }

    if (Object.keys(updates).length) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: updates },
        },
      });
      if (ops.length >= 500) {
        const result = await ApiMaster.bulkWrite(ops.splice(0, ops.length));
        updated += result.modifiedCount || 0;
      }
    }
  }

  if (ops.length) {
    const result = await ApiMaster.bulkWrite(ops);
    updated += result.modifiedCount || 0;
  }

  if (createIndexes) {
    await ApiMaster.collection.createIndex({ normalizedKey: 1 }, { unique: true });
    await ApiPublicManufacturers.collection.createIndex({ apiMasterId: 1, supplierKey: 1 }, { unique: true });
  }

  return { scanned, updated };
};

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is required");
    process.exit(1);
  }

  await mongoose.connect(uri);
  try {
    const result = await runMigration();
    console.log("API Master v2 migration complete", result);
  } catch (err) {
    console.error("API Master v2 migration failed", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
