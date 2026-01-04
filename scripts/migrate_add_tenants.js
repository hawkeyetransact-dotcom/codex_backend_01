/**
 * Migration: create tenants and attach tenant_id to users and profiles.
 * Heuristics:
 *  - companyName from profile; fallback to email domain.
 *  - tenant name key = `${role}-${slug(companyName)}`
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";

dotenv.config({ path: "./.env" });

const slugify = (str) =>
  (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "default";

const profileLoaders = [
  { role: "supplier", Model: SupplierProfile },
  { role: "buyer", Model: BuyerProfile },
  { role: "auditor", Model: AuditorProfile },
];

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  const tenantCache = new Map(); // key -> tenantId
  let createdTenants = 0;
  let updatedUsers = 0;
  let unresolved = [];

  const getOrCreateTenant = async (key, displayName, type) => {
    if (tenantCache.has(key)) return tenantCache.get(key);
    let t = await Tenant.findOne({ name: key });
    if (!t) {
      t = await Tenant.create({
        name: key,
        displayName: displayName || key,
        type,
      });
      createdTenants += 1;
      console.log("Created tenant", key);
    }
    tenantCache.set(key, t._id);
    return t._id;
  };

  for (const loader of profileLoaders) {
    const profiles = await loader.Model.find({});
    for (const profile of profiles) {
      const user = await User.findById(profile.user_id);
      if (!user) continue;
      if (user.tenant_id && profile.tenant_id) continue;
      const companyName =
        profile.companyName ||
        (user.email && user.email.split("@")[1]) ||
        "default";
      const key = `${loader.role}-${slugify(companyName)}`;
      const tenantId = await getOrCreateTenant(key, companyName, loader.role.toUpperCase());
      if (!user.tenant_id) {
        user.tenant_id = tenantId;
        await user.save();
        updatedUsers += 1;
      }
      if (!profile.tenant_id) {
        profile.tenant_id = tenantId;
        await profile.save();
      }
    }
  }

  // Handle users without profiles
  const usersNoTenant = await User.find({ tenant_id: null });
  for (const user of usersNoTenant) {
    const domain = user.email && user.email.split("@")[1];
    const key = `${user.role || "user"}-${slugify(domain)}`;
    const tenantId = await getOrCreateTenant(key, domain || "Unknown", "INTERNAL");
    user.tenant_id = tenantId;
    await user.save();
    updatedUsers += 1;
  }

  console.log("Migration complete");
  console.log({ createdTenants, updatedUsers, unresolved: unresolved.length });
  if (unresolved.length) {
    console.log("Unresolved users:", unresolved);
  }
  await mongoose.connection.close();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
