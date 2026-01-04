/**
 * Seed three test users and tenants:
 *  - Hawkeye Admin (superadmin, internal tenant)
 *  - Buyer Admin (tenant_admin on BuyerCo tenant)
 *  - Supplier Admin (tenant_admin on SupplierCo tenant)
 *
 * Usage: node scripts/seed_test_users.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";

dotenv.config({ path: "./.env" });

const USERS = [
  {
    email: "hawkeye.admin+super@hawkeyesmart.com",
    password: "H@wk3yAdmin!",
    role: "superadmin",
    tenantKey: "hawkeye-internal",
    tenantName: "Hawkeye Internal",
    tenantType: "INTERNAL",
  },
  {
    email: "buyer.admin+tenant@hawkeyesmart.com",
    password: "BuyerAdmin123!",
    role: "tenant_admin",
    tenantKey: "buyerco",
    tenantName: "BuyerCo",
    tenantType: "BUYER",
  },
  {
    email: "supplier.admin+tenant@hawkeyesmart.com",
    password: "SupplierAdmin123!",
    role: "tenant_admin",
    tenantKey: "supplierco",
    tenantName: "SupplierCo",
    tenantType: "SUPPLIER",
  },
];

const getOrCreateTenant = async (key, displayName, type) => {
  let t = await Tenant.findOne({ name: key });
  if (!t) {
    t = await Tenant.create({
      name: key,
      displayName: displayName || key,
      type: type || "INTERNAL",
      status: "ACTIVE",
    });
    console.log("Created tenant", key);
  }
  return t;
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");

  for (const u of USERS) {
    const tenant = await getOrCreateTenant(u.tenantKey, u.tenantName, u.tenantType);
    const existing = await User.findOne({ email: u.email, tenant_id: tenant._id });
    if (existing) {
      console.log("User already exists:", u.email);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 10);
    const user = await User.create({
      email: u.email,
      password: hash,
      role: u.role,
      tenant_id: tenant._id,
      status: "ACTIVE",
      isEmailVerified: true,
    });
    console.log("Created user:", u.email, "tenant:", tenant.name);
  }

  await mongoose.connection.close();
  console.log("Done");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
