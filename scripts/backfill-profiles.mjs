import mongoose from "mongoose";
import dotenv from "dotenv";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";
import { User } from "../src/models/userModel.js";

dotenv.config();

const fallback = (email) => {
  const [namePart] = (email || "").split("@");
  const parts = (namePart || "user").split(".").filter(Boolean);
  const firstName = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : "User";
  const lastName = parts[1] ? parts[1][0].toUpperCase() + parts[1].slice(1) : "Test";
  return { firstName, lastName };
};

const createBuyerProfile = async (user) => {
  const { firstName, lastName } = fallback(user.email);
  await BuyerProfile.create({
    user_id: user._id,
    tenant_id: user.tenant_id || null,
    title: "Mr",
    firstName,
    lastName,
    countryCode: "+1",
    phone: 1000000000,
    companyName: `${firstName} Co`,
    addressline1: "Address pending",
    zipcode: "00000",
    isProfileCompleted: false,
  });
};

const createSupplierProfile = async (user) => {
  const { firstName, lastName } = fallback(user.email);
  await SupplierProfile.create({
    user_id: user._id,
    tenant_id: user.tenant_id || null,
    title: "Mr",
    firstName,
    lastName,
    countryCode: "+1",
    phone: 1000000000,
    companyName: `${firstName} Co`,
    addressline1: "Address pending",
    zipcode: "00000",
    isProfileCompleted: false,
  });
};

const createAuditorProfile = async (user) => {
  const { firstName, lastName } = fallback(user.email);
  await AuditorProfile.create({
    user_id: user._id,
    tenant_id: user.tenant_id || null,
    title: "Mr",
    firstName,
    lastName,
    countryCode: "+1",
    phone: 1000000000,
    companyName: `${firstName} Co`,
    addressline1: "Address pending",
    zipcode: "00000",
    isProfileCompleted: false,
    workExperiences: [],
    certifications: [],
    identityDocuments: [],
  });
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ role: { $in: ["buyer", "supplier", "auditor"] } }).lean();
  let created = 0;
  for (const user of users) {
    if (user.role === "buyer") {
      const exists = await BuyerProfile.findOne({ user_id: user._id });
      if (!exists) { await createBuyerProfile(user); created++; }
    }
    if (user.role === "supplier") {
      const exists = await SupplierProfile.findOne({ user_id: user._id });
      if (!exists) { await createSupplierProfile(user); created++; }
    }
    if (user.role === "auditor") {
      const exists = await AuditorProfile.findOne({ user_id: user._id });
      if (!exists) { await createAuditorProfile(user); created++; }
    }
  }
  console.log(`Backfill complete. Created ${created} profiles.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
