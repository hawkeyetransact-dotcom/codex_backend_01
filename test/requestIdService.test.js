import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AuditRequestAlias } from "../src/models/auditRequestAliasModel.js";
import { RequestIdCounter } from "../src/models/requestIdCounterModel.js";
import { ensureAuditRequestIds, getCounterKey, nextSeq } from "../src/services/requestIdService.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const scopeId = new mongoose.Types.ObjectId();
  const counterKey = getCounterKey("BUYER_TENANT", scopeId, 2026);
  const seqs = await Promise.all([nextSeq(counterKey), nextSeq(counterKey), nextSeq(counterKey)]);
  assert.equal(new Set(seqs).size, 3);
  assert.deepEqual([...seqs].sort((a, b) => a - b), [1, 2, 3]);

  const auditRequest = await AuditRequestMaster.create({
    supplier_id: new mongoose.Types.ObjectId(),
    auditor_id: new mongoose.Types.ObjectId(),
    create_by_buyer_id: new mongoose.Types.ObjectId(),
    supplier_product_id: new mongoose.Types.ObjectId(),
    site_id: new mongoose.Types.ObjectId(),
    complianceDate: new Date(),
  });

  const buyerTenantId = new mongoose.Types.ObjectId();
  const supplierTenantId = new mongoose.Types.ObjectId();
  const first = await ensureAuditRequestIds({
    auditRequest,
    buyerTenantId,
    supplierTenantId,
  });

  assert.ok(/^HK-\d{10}-\d{4}$/.test(String(first.hawkeyeRequestId || "")));
  assert.ok(first.buyerAliasDisplayId);
  assert.ok(first.supplierAliasDisplayId);

  const aliasCount = await AuditRequestAlias.countDocuments({ requestObjectId: auditRequest._id });
  assert.equal(aliasCount, 2);

  const second = await ensureAuditRequestIds({
    auditRequest,
    buyerTenantId,
    supplierTenantId,
  });

  const aliasCountSecond = await AuditRequestAlias.countDocuments({ requestObjectId: auditRequest._id });
  assert.equal(aliasCountSecond, 2);
  assert.equal(second.hawkeyeRequestId, first.hawkeyeRequestId);

  const counterDocs = await RequestIdCounter.find({ _id: counterKey }).lean();
  assert.equal(counterDocs.length, 1);

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
