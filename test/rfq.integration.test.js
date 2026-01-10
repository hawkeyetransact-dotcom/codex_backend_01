import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditRFQ } from "../src/models/auditRfqModel.js";
import { AuditRFQQuote } from "../src/models/auditRfqQuoteModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { ProductSiteMappings } from "../src/models/productSiteMappingModel.js";
import { SupplierSite } from "../src/models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../src/models/supplierMasterProductModel.js";
import { User } from "../src/models/userModel.js";
import Tenant from "../src/models/tenantModel.js";
import {
  createRfq,
  updateRfq,
  publishRfq,
  inviteAuditors,
  submitQuote,
  awardQuote,
} from "../src/controllers/rfqController.js";

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
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  const buyerTenant = await Tenant.create({ name: "buyer-tenant", displayName: "Buyer Tenant", type: "BUYER", status: "ACTIVE" });
  const auditorTenant = await Tenant.create({ name: "auditor-tenant", displayName: "Auditor Tenant", type: "AUDITOR", status: "ACTIVE" });
  const supplierTenant = await Tenant.create({ name: "supplier-tenant", displayName: "Supplier Tenant", type: "SUPPLIER", status: "ACTIVE" });

  const buyer = await User.create({ email: "buyer@test.com", password: "secret", role: "buyer", tenant_id: buyerTenant._id, status: "ACTIVE", isEmailVerified: true });
  const auditor = await User.create({ email: "auditor@test.com", password: "secret", role: "auditor", tenant_id: auditorTenant._id, status: "ACTIVE", isEmailVerified: true });
  const supplier = await User.create({ email: "supplier@test.com", password: "secret", role: "supplier", tenant_id: supplierTenant._id, status: "ACTIVE", isEmailVerified: true });

  const site = await SupplierSite.create({
    user_id: supplier._id,
    tenant_id: supplierTenant._id,
    site_name: "Plant A",
    address_line1: "123 Road",
    city: "City",
    state: "State",
    country: "USA",
    zipcode: "12345",
    contact_person_title: "Mr",
    contact_person_fname: "Supplier",
    contact_person_lname: "One",
    contact_email: "supplier@test.com",
    contact_phone_countryCode: "+1",
    contact_phone: "1234567890",
    plant_id: "PLANT-1",
  });
  const product = await SupplierMasterProducts.create({
    name: "API",
    casNumber: "50-00-0",
    apiTechnology: "CHEM",
    dosageForm: "Powder",
    plant_id: "PLANT-1",
  });
  await ProductSiteMappings.create({
    user_id: supplier._id,
    site_id: site._id,
    product_id: product._id,
  });

  const createReq = {
    body: { title: "GMP Audit RFQ" },
    user: buyer,
    tenantId: String(buyerTenant._id),
  };
  const createRes = makeRes();
  await createRfq(createReq, createRes);
  assert.strictEqual(createRes.statusCode, 201);
  const rfqId = createRes.body?.data?._id;
  assert.ok(rfqId);

  const updateReq = {
    params: { id: rfqId },
    body: {
      supplierOrgId: supplier._id.toString(),
      siteId: site._id.toString(),
      productIds: [product._id.toString()],
      auditType: "GMP",
      auditMode: "Onsite",
      standards: ["ICH Q7"],
      scopeText: "Full GMP audit",
      deliverables: ["Audit report"],
      preferredWindow: { startDate: new Date().toISOString(), endDate: new Date().toISOString() },
      closingAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    user: buyer,
    tenantId: String(buyerTenant._id),
  };
  const updateRes = makeRes();
  await updateRfq(updateReq, updateRes);
  assert.strictEqual(updateRes.statusCode, 200);

  const publishReq = { params: { id: rfqId }, user: buyer, tenantId: String(buyerTenant._id) };
  const publishRes = makeRes();
  await publishRfq(publishReq, publishRes);
  assert.strictEqual(publishRes.statusCode, 200);

  const inviteReq = {
    params: { id: rfqId },
    body: { auditorOrgIds: [String(auditorTenant._id)] },
    user: buyer,
    tenantId: String(buyerTenant._id),
  };
  const inviteRes = makeRes();
  await inviteAuditors(inviteReq, inviteRes);
  assert.strictEqual(inviteRes.statusCode, 200);

  const quoteReq = {
    params: { id: rfqId },
    body: {
      lineItems: [{ label: "Audit days", quantity: 3, unitPrice: 1000 }],
      currency: "USD",
      totals: { tax: 0 },
    },
    user: auditor,
    tenantId: String(auditorTenant._id),
  };
  const quoteRes = makeRes();
  await submitQuote(quoteReq, quoteRes);
  assert.strictEqual(quoteRes.statusCode, 201);
  const quoteId = quoteRes.body?.data?._id;
  assert.ok(quoteId);

  const awardReq = {
    params: { id: rfqId },
    body: { quoteId },
    user: buyer,
    tenantId: String(buyerTenant._id),
  };
  const awardRes = makeRes();
  await awardQuote(awardReq, awardRes);
  assert.strictEqual(awardRes.statusCode, 200);
  const auditRequestId = awardRes.body?.data?.auditRequestId;
  assert.ok(auditRequestId);

  const auditRequest = await AuditRequestMaster.findById(auditRequestId).lean();
  assert.ok(auditRequest);
  assert.strictEqual(String(auditRequest.rfqId), String(rfqId));
  assert.strictEqual(String(auditRequest.awardedQuoteId), String(quoteId));

  const rfq = await AuditRFQ.findById(rfqId).lean();
  assert.strictEqual(rfq.status, "CONVERTED");
  const quote = await AuditRFQQuote.findById(quoteId).lean();
  assert.strictEqual(quote.status, "ACCEPTED");

  await mongoose.disconnect();
  await mongoServer.stop();
};

run();
