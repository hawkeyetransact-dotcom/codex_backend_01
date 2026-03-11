import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { OrgClaim } from "../src/models/orgClaimModel.js";
import { Organization } from "../src/models/organizationModel.js";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { OrgResolutionService, normalizeOrgName } from "../src/services/orgDirectory/orgResolutionService.js";

let mongoServer;

const setup = async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {});
};

const teardown = async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
};

const run = async () => {
  await setup();

  const tenant = await Tenant.create({ name: "buyer-one", displayName: "Buyer One" });
  const user = await User.create({
    email: "buyer1@test.com",
    password: "secret",
    role: "buyer",
    tenant_id: tenant._id,
  });
  const org = await Organization.create({
    directoryKey: "buyer-one",
    legalName: "Buyer One LLC",
    normalizedLegalName: normalizeOrgName("Buyer One LLC"),
    displayName: "Buyer One",
  });
  await OrgClaim.create({
    orgId: org._id,
    tenantId: tenant._id,
    status: "ACTIVE",
    isPrimary: true,
  });

  const resolvedByClaim = await OrgResolutionService.resolveBuyerOrg({
    buyerUserId: user._id,
    tenantId: tenant._id,
  });
  assert.equal(String(resolvedByClaim._id), String(org._id));

  const tenantTwo = await Tenant.create({ name: "buyer-two", displayName: "Buyer Two" });
  const userTwo = await User.create({
    email: "buyer2@test.com",
    password: "secret",
    role: "buyer",
    tenant_id: tenantTwo._id,
  });
  await BuyerProfile.create({
    user_id: userTwo._id,
    tenant_id: tenantTwo._id,
    title: "Mr.",
    firstName: "Buyer",
    lastName: "Two",
    countryCode: "+1",
    phone: 1234567890,
    companyName: "Buyer Two Pharma",
    addressline1: "123 Main Street",
    zipcode: "60606",
  });

  const resolvedByProfile = await OrgResolutionService.resolveBuyerOrg({
    buyerUserId: userTwo._id,
    tenantId: tenantTwo._id,
  });
  assert.equal(resolvedByProfile.legalName, "Buyer Two Pharma");

  await teardown();
};

run().catch(async (error) => {
  console.error(error);
  await teardown();
  process.exit(1);
});
