import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { updatePublicSignals, recalcSupplier } from "../src/controllers/riskAdminController.js";
import { getBuyerRiskDetail } from "../src/controllers/riskBuyerController.js";

const makeRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenant = await Tenant.create({ name: "risk-tenant", displayName: "Risk Tenant", type: "BUYER", status: "ACTIVE" });
  const supplier = await User.create({ email: "supplier@risk.test", password: "x", role: "supplier", tenant_id: tenant._id, status: "ACTIVE", isEmailVerified: true });
  const admin = await User.create({ email: "admin@risk.test", password: "x", role: "admin", tenant_id: tenant._id, status: "ACTIVE", isEmailVerified: true });
  const buyer = await User.create({ email: "buyer@risk.test", password: "x", role: "buyer", tenant_id: tenant._id, status: "ACTIVE", isEmailVerified: true });

  const updateReq = {
    params: { supplierId: supplier._id.toString() },
    body: {
      fda483CountRecent24m: 2,
      warningLetterRecent24m: false,
      importAlertActive: false,
      inspectionsOpenCount: 1,
      recalls: [{ class: "II", date: new Date().toISOString() }],
    },
    user: admin,
    tenantId: tenant._id.toString(),
  };
  const updateRes = makeRes();
  await updatePublicSignals(updateReq, updateRes);
  assert.strictEqual(updateRes.statusCode, 200);
  assert.ok(updateRes.body?.snapshot);

  const recalcReq = { params: { supplierId: supplier._id.toString() }, user: admin };
  const recalcRes = makeRes();
  await recalcSupplier(recalcReq, recalcRes);
  assert.strictEqual(recalcRes.statusCode, 200);
  assert.ok(recalcRes.body?.data?.finalScore !== undefined);

  const buyerReq = {
    params: { supplierId: supplier._id.toString() },
    user: buyer,
    tenantId: tenant._id.toString(),
  };
  const buyerRes = makeRes();
  await getBuyerRiskDetail(buyerReq, buyerRes);
  assert.strictEqual(buyerRes.statusCode, 200);
  assert.ok(buyerRes.body?.data?.latest);
  assert.ok(Array.isArray(buyerRes.body?.data?.trend));

  await mongoose.disconnect();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
