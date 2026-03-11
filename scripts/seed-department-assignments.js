import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/userModel.js";
import { SupplierUserProfile } from "../src/models/supplierUserProfileModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../src/models/auditQuestionsModels.js";
import { QuestionnaireSectionAssignment } from "../src/models/questionnaireSectionAssignmentModel.js";

const DEFAULT_SUPPLIER_EMAIL = process.env.DEMO_SUPPLIER_EMAIL || "supplier1@test.com";
const DEFAULT_PASSWORD = process.env.DEMO_SUPPLIER_USER_PASSWORD || "Testing@2022";

const isLocalUri = (uri) => /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(uri || "");
const ensureSafe = () => {
  if (process.env.USE_MEMORY_DB === "true") return;
  const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI || "";
  if (process.env.DEPARTMENT_ASSIGN_SEED_ALLOW === "true") return;
  if (!isLocalUri(mongoUri)) {
    console.error("Refusing to seed department assignments on non-local database.");
    console.error("Set DEPARTMENT_ASSIGN_SEED_ALLOW=true to override, or use a localhost Mongo URI.");
    process.exit(1);
  }
};

const ensureSupplierUser = async ({ email, supplierId }) => {
  let user = await User.findOne({ email }).lean();
  if (!user) {
    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    user = await User.create({
      email,
      password: hashed,
      role: "supplierUser",
      tenant_id: (await User.findById(supplierId).select("tenant_id"))?.tenant_id || null,
      invitedBy: supplierId,
      status: "ACTIVE",
    });
  }

  const existingProfile = await SupplierUserProfile.findOne({ user_id: user._id });
  if (!existingProfile) {
    await SupplierUserProfile.create({ user_id: user._id, isProfileCompleted: true });
  }
  return user;
};

const run = async () => {
  ensureSafe();
  await connectDatabase();

  const supplier = await User.findOne({ email: DEFAULT_SUPPLIER_EMAIL, role: "supplier" }).lean();
  if (!supplier) {
    throw new Error(`Supplier not found: ${DEFAULT_SUPPLIER_EMAIL}`);
  }

  const audit = await AuditRequestMaster.findOne({ supplier_id: supplier._id }).sort({ createdAt: -1 }).lean();
  if (!audit) {
    throw new Error("No audit request found for supplier.");
  }

  const questions = await AuditQuestions.find({ auditRequestId: audit._id }).select("categoryName").lean();
  const categories = Array.from(new Set(questions.map((q) => q.categoryName).filter(Boolean)));
  if (!categories.length) {
    throw new Error("No categories found for audit.");
  }

  const userA = await ensureSupplierUser({ email: "supplier-user1@test.com", supplierId: supplier._id });
  const userB = await ensureSupplierUser({ email: "supplier-user2@test.com", supplierId: supplier._id });

  const assignments = categories.map((category, index) => ({
    auditRequestId: audit._id,
    tenantOrgId: audit.tenantOrgId || null,
    categoryName: category,
    assignedToUserId: index % 2 === 0 ? userA._id : userB._id,
    assignedByUserId: supplier._id,
    status: "ASSIGNED",
  }));

  for (const entry of assignments) {
    const exists = await QuestionnaireSectionAssignment.findOne({
      auditRequestId: entry.auditRequestId,
      categoryName: entry.categoryName,
      status: { $ne: "REASSIGNED" },
    }).lean();
    if (exists) continue;
    await QuestionnaireSectionAssignment.create(entry);
  }

  console.log("Department assignments seeded for audit:", audit._id.toString());
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  mongoose.disconnect();
});
