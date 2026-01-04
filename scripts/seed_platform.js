#!/usr/bin/env node
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../src/models/userModel.js";
import Tenant from "../src/models/tenantModel.js";
import { ApprovalRequest } from "../src/models/approvalRequestModel.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI missing");
  process.exit(1);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);

  await User.deleteMany({});
  await Tenant.deleteMany({});
  await ApprovalRequest.deleteMany({});

  const platformAdmin = await User.create({
    email: "platform.admin@example.com",
    password: "Password123!",
    role: "superadmin",
    adminScope: "PLATFORM",
    status: "ACTIVE",
  });

  const buyerTenant = await Tenant.create({ name: "buyer-tenant", displayName: "Buyer Tenant", type: "BUYER" });
  const supplierTenant = await Tenant.create({ name: "supplier-tenant", displayName: "Supplier Tenant", type: "SUPPLIER" });

  const buyerAdmin = await User.create({
    email: "buyer.admin@example.com",
    password: "Password123!",
    role: "tenant_admin",
    adminScope: "TENANT",
    tenant_id: buyerTenant._id,
  });
  const supplierAdmin = await User.create({
    email: "supplier.admin@example.com",
    password: "Password123!",
    role: "tenant_admin",
    adminScope: "TENANT",
    tenant_id: supplierTenant._id,
  });

  const pendingApproval = await ApprovalRequest.create({
    tenant_id: buyerTenant._id,
    requesterUserId: buyerAdmin._id,
    resourceType: "report",
    resourceId: "demo-report-1",
    status: "PENDING",
    reason: "Demo pending approval",
  });

  console.log("Seeded platform admin, tenants, tenant admins, pending approval");
  console.log({ platformAdmin: platformAdmin.email, buyerAdmin: buyerAdmin.email, supplierAdmin: supplierAdmin.email, pendingApproval: pendingApproval._id });
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
