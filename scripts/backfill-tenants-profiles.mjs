import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";

dotenv.config();

const fallback = (email = "") => {
  const [namePart] = email.split("@");
  const parts = (namePart || "user").split(".").filter(Boolean);
  const firstName = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : "User";
  const lastName = parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1) : "Test";
  return { firstName, lastName };
};

const ensureTenant = async () => {
  const existing = await Tenant.findOne({}).lean();
  if (existing) return existing;
  return Tenant.create({ name: "default-tenant", displayName: "Default Tenant", type: "BUYER", status: "ACTIVE" });
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const tenant = await ensureTenant();

  const users = await User.find({ role: { $in: ["buyer", "supplier", "auditor"] } }).lean();
  let updatedTenant = 0;
  for (const u of users) {
    if (!u.tenant_id) {
      await User.updateOne({ _id: u._id }, { $set: { tenant_id: tenant._id } });
      updatedTenant += 1;
    }
  }

  let createdProfiles = 0;
  for (const u of users) {
    const { firstName, lastName } = fallback(u.email);
    const profileBase = {
      user_id: u._id,
      tenant_id: u.tenant_id || tenant._id,
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

    if (u.role === "buyer") {
      const exists = await BuyerProfile.findOne({ user_id: u._id });
      if (!exists) {
        await BuyerProfile.create(profileBase);
        createdProfiles += 1;
      }
    }
    if (u.role === "supplier") {
      const exists = await SupplierProfile.findOne({ user_id: u._id });
      if (!exists) {
        await SupplierProfile.create(profileBase);
        createdProfiles += 1;
      }
    }
    if (u.role === "auditor") {
      const exists = await AuditorProfile.findOne({ user_id: u._id });
      if (!exists) {
        await AuditorProfile.create({ ...profileBase, workExperiences: [], certifications: [], identityDocuments: [] });
        createdProfiles += 1;
      }
    }
  }

  const tenantCount = await Tenant.countDocuments();
  const buyerProfiles = await BuyerProfile.countDocuments();
  const supplierProfiles = await SupplierProfile.countDocuments();
  const auditorProfiles = await AuditorProfile.countDocuments();

  console.log({ updatedTenant, createdProfiles, tenantCount, buyerProfiles, supplierProfiles, auditorProfiles });
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
