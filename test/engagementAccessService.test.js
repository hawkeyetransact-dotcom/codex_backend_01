import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Engagement, EngagementParticipant } from "../src/models/engagementModels.js";
import { OrgClaim } from "../src/models/orgClaimModel.js";
import { Organization } from "../src/models/organizationModel.js";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { EngagementAccessService } from "../src/services/orgDirectory/engagementAccessService.js";

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

  const buyerTenant = await Tenant.create({ name: "buyer-a", displayName: "Buyer A" });
  const supplierTenant = await Tenant.create({ name: "supplier-a", displayName: "Supplier A" });
  const buyerUser = await User.create({
    email: "buyer@test.com",
    password: "secret",
    role: "buyer",
    tenant_id: buyerTenant._id,
  });
  const supplierUser = await User.create({
    email: "supplier@test.com",
    password: "secret",
    role: "supplier",
    tenant_id: supplierTenant._id,
  });

  const buyerOrg = await Organization.create({
    directoryKey: "buyer-a",
    legalName: "Buyer A",
    normalizedLegalName: "buyer a",
    displayName: "Buyer A",
  });
  const supplierOrg = await Organization.create({
    directoryKey: "supplier-a",
    legalName: "Supplier A",
    normalizedLegalName: "supplier a",
    displayName: "Supplier A",
  });

  await OrgClaim.create({ orgId: buyerOrg._id, tenantId: buyerTenant._id, status: "ACTIVE", isPrimary: true });
  await OrgClaim.create({ orgId: supplierOrg._id, tenantId: supplierTenant._id, status: "ACTIVE", isPrimary: true });

  const engagement = await Engagement.create({
    engagementCode: "ENG-TEST-001",
    ownerTenantId: buyerTenant._id,
    buyerOrgId: buyerOrg._id,
    supplierOrgId: supplierOrg._id,
  });

  await EngagementParticipant.create({
    engagementId: engagement._id,
    participantType: "TENANT",
    tenantId: supplierTenant._id,
    orgId: supplierOrg._id,
    role: "SUPPLIER_OWNER",
    permissions: ["read"],
    status: "ACTIVE",
  });

  const supplierAccess = await EngagementAccessService.canAccessEngagement({
    engagementId: engagement._id,
    user: supplierUser,
    tenantId: supplierTenant._id,
  });
  assert.equal(supplierAccess, true);

  const outsiderTenant = await Tenant.create({ name: "outsider", displayName: "Outsider" });
  const outsiderUser = await User.create({
    email: "outsider@test.com",
    password: "secret",
    role: "buyer",
    tenant_id: outsiderTenant._id,
  });

  const outsiderAccess = await EngagementAccessService.canAccessEngagement({
    engagementId: engagement._id,
    user: outsiderUser,
    tenantId: outsiderTenant._id,
  });
  assert.equal(outsiderAccess, false);

  await teardown();
};

run().catch(async (error) => {
  console.error(error);
  await teardown();
  process.exit(1);
});
