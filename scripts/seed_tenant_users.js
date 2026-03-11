import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";

const SET_COUNT = Number(process.env.SEED_TENANT_SET_COUNT || 5);
const PASSWORD = process.env.SEED_TENANT_USER_PASSWORD || "Testing@2022";
const EMAIL_DOMAIN = process.env.SEED_TENANT_EMAIL_DOMAIN || "test.com";

const tenantKey = (idx) => `seed-tenant-${String(idx).padStart(2, "0")}`;
const tenantName = (idx) => `Seed Tenant ${String(idx).padStart(2, "0")}`;
const roleEmail = (idx, role) => `${tenantKey(idx)}-${role.replace("_", "-")}@${EMAIL_DOMAIN}`;

const ensureTenant = async (idx) => {
  const name = tenantKey(idx);
  let tenant = await Tenant.findOne({ name });
  if (!tenant) {
    tenant = await Tenant.create({
      name,
      displayName: tenantName(idx),
      type: "BUYER",
      status: "ACTIVE",
    });
    console.log("Created tenant", name);
  }
  return tenant;
};

const ensureUser = async ({ email, role, tenantId, passwordHash }) => {
  let user = await User.findOne({ email });
  const desiredScope = role === "tenant_admin" ? "TENANT" : "NONE";
  if (!user) {
    user = await User.create({
      email,
      password: passwordHash,
      role,
      tenant_id: tenantId,
      adminScope: desiredScope,
      status: "ACTIVE",
      isEmailVerified: true,
    });
    console.log("Created user", email);
    return user;
  }

  const updates = {};
  if (!user.tenant_id) updates.tenant_id = tenantId;
  if (user.role !== role) updates.role = role;
  if (user.adminScope !== desiredScope) updates.adminScope = desiredScope;
  if (Object.keys(updates).length) {
    await User.updateOne({ _id: user._id }, { $set: updates });
    user = await User.findById(user._id);
    console.log("Updated user", email);
  } else {
    console.log("User already exists", email);
  }
  return user;
};

const ensureProfile = async (Model, query, payload) => {
  const existing = await Model.findOne(query);
  if (!existing) {
    await Model.create(payload);
    return "created";
  }
  const updates = {};
  if (!existing.tenant_id && payload.tenant_id) updates.tenant_id = payload.tenant_id;
  if (!existing.user_id && payload.user_id) updates.user_id = payload.user_id;
  if (Object.keys(updates).length) {
    await Model.updateOne({ _id: existing._id }, { $set: updates });
    return "updated";
  }
  return "skipped";
};

const baseProfile = ({ userId, tenantId, roleLabel, idx, setIdx }) => ({
  user_id: userId,
  tenant_id: tenantId,
  title: "Mr",
  firstName: roleLabel,
  lastName: `Seed${String(setIdx).padStart(2, "0")}`,
  countryCode: "+1",
  phone: 5550000000 + setIdx * 10 + idx,
  companyName: `${tenantName(setIdx)} ${roleLabel}`,
  addressline1: `${setIdx} Seed St`,
  zipcode: `10${String(setIdx).padStart(2, "0")}0${idx}`,
  isProfileCompleted: true,
});

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (let i = 1; i <= SET_COUNT; i += 1) {
    const tenant = await ensureTenant(i);
    const tenantId = tenant._id;

    const tenantAdmin = await ensureUser({
      email: roleEmail(i, "tenant_admin"),
      role: "tenant_admin",
      tenantId,
      passwordHash,
    });
    const buyer = await ensureUser({
      email: roleEmail(i, "buyer"),
      role: "buyer",
      tenantId,
      passwordHash,
    });
    const supplier = await ensureUser({
      email: roleEmail(i, "supplier"),
      role: "supplier",
      tenantId,
      passwordHash,
    });
    const auditor = await ensureUser({
      email: roleEmail(i, "auditor"),
      role: "auditor",
      tenantId,
      passwordHash,
    });

    const buyerProfileStatus = await ensureProfile(
      BuyerProfile,
      { user_id: buyer._id },
      baseProfile({ userId: buyer._id, tenantId, roleLabel: "Buyer", idx: 1, setIdx: i })
    );
    const supplierProfileStatus = await ensureProfile(
      SupplierProfile,
      { user_id: supplier._id },
      baseProfile({ userId: supplier._id, tenantId, roleLabel: "Supplier", idx: 2, setIdx: i })
    );
    const auditorProfileStatus = await ensureProfile(
      AuditorProfile,
      { user_id: auditor._id },
      baseProfile({ userId: auditor._id, tenantId, roleLabel: "Auditor", idx: 3, setIdx: i })
    );

    console.log(
      `Seed ${i}: tenant_admin=${tenantAdmin.email}, buyer=${buyer.email} (${buyerProfileStatus}), supplier=${supplier.email} (${supplierProfileStatus}), auditor=${auditor.email} (${auditorProfileStatus})`
    );
  }

  await mongoose.connection.close();
  console.log("Done");
};

main().catch((err) => {
  console.error("seed_tenant_users failed", err);
  process.exit(1);
});
