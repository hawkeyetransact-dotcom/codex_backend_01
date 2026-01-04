import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { User } from "../src/models/userModel.js";
import Tenant from "../src/models/tenantModel.js";

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const tenants = await Tenant.find({}).limit(1).lean();
  const tenant =
    tenants[0] ||
    (await Tenant.create({
      name: "test-tenant",
      displayName: "Test Tenant",
      type: "BUYER",
      status: "ACTIVE",
    }));

  const roles = ["superadmin", "tenant_admin", "buyer", "supplier", "auditor"];
  for (const role of roles) {
    for (let i = 1; i <= 5; i++) {
      const email = `${role}${i}@test.com`;
      const hash = await bcrypt.hash("Test@2026", 10);
      await User.findOneAndUpdate(
        { email },
        {
          $set: {
            email,
            password: hash,
            role,
            tenant_id: tenant._id,
            adminScope: role === "superadmin" ? "PLATFORM" : role === "tenant_admin" ? "TENANT" : "NONE",
            status: "ACTIVE",
            isEmailVerified: true,
          },
        },
        { upsert: true, new: true }
      );
    }
  }
  console.log("Created/updated test users with password Test@2026");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
