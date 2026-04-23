/**
 * diag-all-users.mjs — list all users in the database
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { User } from "../src/models/userModel.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Database:", mongoose.connection.db.databaseName);

const users = await User.find({}).select("email role tenant_id createdAt").sort({ createdAt: 1 });
console.log(`\nTotal users: ${users.length}`);
for (const u of users) {
  console.log(`  ${u.email} | role=${u.role} | tenant_id=${u.tenant_id ?? "null"} | created=${u.createdAt?.toISOString().slice(0,10)}`);
}

await mongoose.disconnect();
