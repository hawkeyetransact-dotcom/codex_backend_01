import mongoose from "mongoose";
import dotenv from "dotenv";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import SequenceCounter from "../src/models/sequenceCounterModel.js";
import { getNextSequence } from "../src/utils/sequenceGenerator.js";

dotenv.config({ path: "../.env" });

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await mongoose.connect(uri);
  console.log("Connected");

  const audits = await AuditRequestMaster.find({
    $or: [
      { internalSequence: { $exists: false } },
      { internalSequence: null },
      { internalRequestId: { $exists: false } },
      { internalRequestId: null },
      { supplierSequence: { $exists: false } },
      { supplierSequence: null },
      { supplierRequestId: { $exists: false } },
      { supplierRequestId: null },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();

  let updated = 0;
  for (const audit of audits) {
    const internalSeq = audit.internalSequence || (await getNextSequence("audit:global"));
    const supplierSeq = audit.supplierSequence || (await getNextSequence(`audit:supplier:${audit.supplier_id}`));
    const internalRequestId = audit.internalRequestId || `REQ-${String(internalSeq).padStart(6, "0")}`;
    const supplierRequestId = audit.supplierRequestId || `REQ-${String(supplierSeq).padStart(4, "0")}`;

    await AuditRequestMaster.updateOne(
      { _id: audit._id },
      {
        $set: {
          internalSequence: internalSeq,
          internalRequestId,
          supplierSequence: supplierSeq,
          supplierRequestId,
        },
      }
    );
    updated += 1;
  }

  console.log(`Backfill complete. Updated ${updated} audits.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Backfill failed", err);
  process.exit(1);
});
