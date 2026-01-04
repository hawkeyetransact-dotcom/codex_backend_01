import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";

dotenv.config();
const pwd = "Test@2026";
const hashPwd = async () => bcrypt.hash(pwd, 10);

const ensureTenant = async (name, displayName, type) => {
  const existing = await Tenant.findOne({ name });
  if (existing) return existing;
  return Tenant.create({ name, displayName, type, status: "ACTIVE" });
};

const ensureProfile = async (user, role) => {
  const [namePart] = (user.email || "user").split("@");
  const parts = namePart.split(".").filter(Boolean);
  const firstName = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : "User";
  const lastName = parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1) : "Test";
  const base = {
    user_id: user._id,
    tenant_id: user.tenant_id,
    title: "Mr",
    firstName,
    lastName,
    countryCode: "+1",
    phone: 1000000000,
    companyName: `${firstName} Co`,
    addressline1: "Address pending",
    zipcode: "00000",
    isProfileCompleted: false,
  };
  if (role === "buyer") {
    if (!(await BuyerProfile.findOne({ user_id: user._id }))) await BuyerProfile.create(base);
  } else if (role === "supplier") {
    if (!(await SupplierProfile.findOne({ user_id: user._id }))) await SupplierProfile.create(base);
  } else if (role === "auditor") {
    if (!(await AuditorProfile.findOne({ user_id: user._id }))) await AuditorProfile.create({ ...base, workExperiences: [], certifications: [], identityDocuments: [] });
  }
};

const ensureUser = async ({ email, role, tenant_id, adminScope = "NONE" }) => {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, password: await hashPwd(), role, tenant_id, adminScope, status: "ACTIVE", isEmailVerified: true });
  } else {
    await User.updateOne({ _id: user._id }, { $set: { tenant_id, role, adminScope, status: "ACTIVE" } });
    user = await User.findById(user._id);
  }
  await ensureProfile(user, role === "tenant_admin" ? "buyer" : role);
  return user;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const buyerA = await ensureTenant("tenant-a", "Tenant A", "BUYER");
  const buyerB = await ensureTenant("tenant-b", "Tenant B", "BUYER");
  const supplier1 = await ensureTenant("supplier-1", "Supplier 1", "SUPPLIER");
  const supplier2 = await ensureTenant("supplier-2", "Supplier 2", "SUPPLIER");
  const extAud1 = await ensureTenant("ext-auditor-1", "External Auditor 1", "AUDITOR");
  const extAud2 = await ensureTenant("ext-auditor-2", "External Auditor 2", "AUDITOR");

  await ensureUser({ email: "tenantadminA@test.com", role: "tenant_admin", tenant_id: buyerA._id, adminScope: "TENANT" });
  await ensureUser({ email: "tenantadminB@test.com", role: "tenant_admin", tenant_id: buyerB._id, adminScope: "TENANT" });
  await ensureUser({ email: "buyerA1@test.com", role: "buyer", tenant_id: buyerA._id });
  await ensureUser({ email: "buyerA2@test.com", role: "buyer", tenant_id: buyerA._id });
  await ensureUser({ email: "buyerB1@test.com", role: "buyer", tenant_id: buyerB._id });
  await ensureUser({ email: "buyerB2@test.com", role: "buyer", tenant_id: buyerB._id });

  await ensureUser({ email: "supplier1@test.com", role: "supplier", tenant_id: supplier1._id });
  await ensureUser({ email: "supplier2@test.com", role: "supplier", tenant_id: supplier2._id });

  await ensureUser({ email: "extaud1@test.com", role: "auditor", tenant_id: extAud1._id });
  await ensureUser({ email: "extaud2@test.com", role: "auditor", tenant_id: extAud2._id });

  await ensureUser({ email: "intaudA1@test.com", role: "auditor", tenant_id: buyerA._id });
  await ensureUser({ email: "intaudA2@test.com", role: "auditor", tenant_id: buyerA._id });
  await ensureUser({ email: "intaudB1@test.com", role: "auditor", tenant_id: buyerB._id });
  await ensureUser({ email: "intaudB2@test.com", role: "auditor", tenant_id: buyerB._id });

  const tenants = await Tenant.countDocuments();
  const users = await User.countDocuments();
  console.log("Setup complete", { tenants, users, password: pwd });
  await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
