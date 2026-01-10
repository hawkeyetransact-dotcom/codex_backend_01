import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";

const COUNT = Number(process.env.SEED_PERSONA_COUNT || 5);
const PASSWORD = process.env.SEED_PERSONA_PASSWORD || "Test@2026";
const EMAIL_DOMAIN = process.env.SEED_PERSONA_EMAIL_DOMAIN || "test.com";
const SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL || "hawkeye-admin@test.com";

const tenantName = (prefix, idx) => `${prefix}-${String(idx).padStart(2, "0")}`;
const tenantDisplay = (label, idx) => `${label} ${String(idx).padStart(2, "0")}`;
const emailFor = (prefix, idx) => `${prefix}${idx}@${EMAIL_DOMAIN}`;

const ensureTenant = async ({ name, displayName, type }) => {
  let tenant = await Tenant.findOne({ name });
  if (!tenant) {
    tenant = await Tenant.create({
      name,
      displayName,
      type,
      status: "ACTIVE",
    });
    console.log("Created tenant", name);
  }
  return tenant;
};

const ensureUser = async ({ email, role, tenantId, adminScope, passwordHash }) => {
  let user = await User.findOne({ email });
  if (user) {
    const updates = {};
    if (role && user.role !== role) updates.role = role;
    if (adminScope && user.adminScope !== adminScope) updates.adminScope = adminScope;
    if (tenantId && String(user.tenant_id || "") !== String(tenantId)) updates.tenant_id = tenantId;
    if (adminScope === "PLATFORM") updates.tenant_id = null;
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      user = await User.findById(user._id);
      console.log("Updated user", email);
    } else {
      console.log("User already exists", email);
    }
    return user;
  }

  user = await User.create({
    email,
    password: passwordHash,
    role,
    tenant_id: adminScope === "PLATFORM" ? null : tenantId,
    adminScope: adminScope || "NONE",
    status: "ACTIVE",
    isEmailVerified: true,
  });
  console.log("Created user", email);
  return user;
};

const ensureProfile = async (Model, query, payload) => {
  const existing = await Model.findOne(query);
  if (!existing) {
    await Model.create(payload);
    return "created";
  }
  if (!existing.tenant_id && payload.tenant_id) {
    await Model.updateOne({ _id: existing._id }, { $set: { tenant_id: payload.tenant_id } });
    return "updated";
  }
  return "skipped";
};

const baseProfile = ({ userId, tenantId, roleLabel, idx }) => ({
  user_id: userId,
  tenant_id: tenantId,
  title: "Mr",
  firstName: `${roleLabel}${idx}`,
  lastName: "Seed",
  countryCode: "+1",
  phone: 5551000000 + idx,
  companyName: `${roleLabel} Org ${idx}`,
  addressline1: `${idx} Seed St`,
  zipcode: `100${idx}`,
  isProfileCompleted: true,
});

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (let i = 1; i <= COUNT; i += 1) {
    const supplierTenant = await ensureTenant({
      name: tenantName("supplier", i),
      displayName: tenantDisplay("Supplier", i),
      type: "SUPPLIER",
    });
    const buyerTenant = await ensureTenant({
      name: tenantName("buyer", i),
      displayName: tenantDisplay("Buyer", i),
      type: "BUYER",
    });
    const auditorTenant = await ensureTenant({
      name: tenantName("auditor", i),
      displayName: tenantDisplay("Auditor", i),
      type: "AUDITOR",
    });

    const supplierUser = await ensureUser({
      email: emailFor("supplier", i),
      role: "supplier",
      tenantId: supplierTenant._id,
      passwordHash,
    });
    const buyerUser = await ensureUser({
      email: emailFor("buyer", i),
      role: "buyer",
      tenantId: buyerTenant._id,
      passwordHash,
    });
    const auditorUser = await ensureUser({
      email: emailFor("auditor", i),
      role: "auditor",
      tenantId: auditorTenant._id,
      passwordHash,
    });

    const supplierProfileStatus = await ensureProfile(
      SupplierProfile,
      { user_id: supplierUser._id },
      baseProfile({ userId: supplierUser._id, tenantId: supplierTenant._id, roleLabel: "Supplier", idx: i })
    );
    const buyerProfileStatus = await ensureProfile(
      BuyerProfile,
      { user_id: buyerUser._id },
      baseProfile({ userId: buyerUser._id, tenantId: buyerTenant._id, roleLabel: "Buyer", idx: i })
    );
    const auditorProfileStatus = await ensureProfile(
      AuditorProfile,
      { user_id: auditorUser._id },
      baseProfile({ userId: auditorUser._id, tenantId: auditorTenant._id, roleLabel: "Auditor", idx: i })
    );

    console.log(
      `Seed ${i}: supplier=${supplierUser.email} (${supplierProfileStatus}), buyer=${buyerUser.email} (${buyerProfileStatus}), auditor=${auditorUser.email} (${auditorProfileStatus})`
    );
  }

  const superadmin = await ensureUser({
    email: SUPERADMIN_EMAIL,
    role: "superadmin",
    tenantId: null,
    adminScope: "PLATFORM",
    passwordHash,
  });
  if (superadmin) {
    console.log("Superadmin ready", superadmin.email);
  }

  await mongoose.connection.close();
  console.log("Done");
};

main().catch((err) => {
  console.error("seed_persona_users failed", err);
  process.exit(1);
});
