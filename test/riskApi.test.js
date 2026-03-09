import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { updatePublicSignals, recalcSupplier } from "../src/controllers/riskAdminController.js";
import { getBuyerRiskDetail, getBuyerRiskSummary } from "../src/controllers/riskBuyerController.js";

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
  const supplierTenant = await Tenant.create({
    name: "risk-supplier-tenant",
    displayName: "Risk Supplier Tenant",
    type: "SUPPLIER",
    status: "ACTIVE",
  });
  const supplier = await User.create({ email: "supplier@risk.test", password: "x", role: "supplier", tenant_id: tenant._id, status: "ACTIVE", isEmailVerified: true });
  const supplierCrossTenant = await User.create({
    email: "supplier-cross@risk.test",
    password: "x",
    role: "supplier",
    tenant_id: supplierTenant._id,
    status: "ACTIVE",
    isEmailVerified: true,
  });
  const admin = await User.create({ email: "admin@risk.test", password: "x", role: "admin", tenant_id: tenant._id, status: "ACTIVE", isEmailVerified: true });
  const buyer = await User.create({ email: "buyer@risk.test", password: "x", role: "buyer", tenant_id: tenant._id, status: "ACTIVE", isEmailVerified: true });
  await SupplierProfile.create({
    user_id: supplier._id,
    tenant_id: tenant._id,
    title: "Mr",
    firstName: "Risk",
    lastName: "Supplier",
    countryCode: "1",
    phone: 5551234567,
    companyName: "Risk Supplier Org",
    addressline1: "123 Road",
    country: "US",
    state: "CA",
    city: "San Diego",
    zipcode: "92093",
    isProfileCompleted: true,
  });
  await SupplierProfile.create({
    user_id: supplierCrossTenant._id,
    tenant_id: supplierTenant._id,
    title: "Mr",
    firstName: "Cross",
    lastName: "Tenant",
    countryCode: "1",
    phone: 5559876543,
    companyName: "Cross Tenant Supplier",
    addressline1: "99 External Road",
    country: "US",
    state: "NJ",
    city: "Trenton",
    zipcode: "08608",
    isProfileCompleted: true,
  });

  await AuditRequestMaster.create({
    tenantOrgId: String(tenant._id),
    supplier_id: supplierCrossTenant._id,
    create_by_buyer_id: buyer._id,
    supplier_product_id: new mongoose.Types.ObjectId(),
    complianceDate: new Date(),
    site_id: new mongoose.Types.ObjectId(),
  });

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

  const crossTenantRecalcReq = {
    params: { supplierId: supplierCrossTenant._id.toString() },
    user: admin,
  };
  const crossTenantRecalcRes = makeRes();
  await recalcSupplier(crossTenantRecalcReq, crossTenantRecalcRes);
  assert.strictEqual(crossTenantRecalcRes.statusCode, 200);
  assert.ok(crossTenantRecalcRes.body?.data?.finalScore !== undefined);

  const summaryReq = { query: {}, user: buyer, tenantId: tenant._id.toString() };
  const summaryRes = makeRes();
  await getBuyerRiskSummary(summaryReq, summaryRes);
  assert.strictEqual(summaryRes.statusCode, 200);
  assert.ok(Array.isArray(summaryRes.body?.data));
  assert.ok(
    summaryRes.body.data.some((row) => String(row.supplierId) === String(supplierCrossTenant._id)),
    "Expected cross-tenant supplier linked by audit to appear in buyer risk summary"
  );

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

  const buyerCrossReq = {
    params: { supplierId: supplierCrossTenant._id.toString() },
    user: buyer,
    tenantId: tenant._id.toString(),
  };
  const buyerCrossRes = makeRes();
  await getBuyerRiskDetail(buyerCrossReq, buyerCrossRes);
  assert.strictEqual(buyerCrossRes.statusCode, 200);
  assert.ok(buyerCrossRes.body?.data?.latest);

  await mongoose.disconnect();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
