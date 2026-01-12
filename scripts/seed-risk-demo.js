import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models/userModel.js";
import Tenant from "../src/models/tenantModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { SupplierPublicSignal } from "../src/models/SupplierPublicSignal.js";
import { SupplierRiskMetrics } from "../src/models/SupplierRiskMetrics.js";
import { recalculateSupplierRisk } from "../src/services/risk/riskOrchestrator.js";
import { connectDatabase } from "../src/config/database.js";

const isLocalUri = (uri) => /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(uri || "");

const ensureSafe = () => {
  if (process.env.USE_MEMORY_DB === "true") return;
  const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI || "";
  if (process.env.RISK_SEED_ALLOW === "true") return;
  if (!isLocalUri(mongoUri)) {
    console.error("Refusing to seed risk demo data on non-local database.");
    console.error("Set RISK_SEED_ALLOW=true to override, or use a localhost Mongo URI.");
    process.exit(1);
  }
};

const SUPPLIERS = [
  {
    email: "risk-sup-a@test.com",
    companyName: "Risk Demo Supplier A",
    metrics: {
      questionnaireOnTimeRate: 0.95,
      avgResponseHoursToFollowups: 12,
      capaOverdueCount: 0,
      capaReopenRate: 0.05,
      evidenceQualityScore: 90,
      docCompletenessScore: 92,
    },
    signals: {
      fda483CountRecent24m: 0,
      warningLetterRecent24m: false,
      importAlertActive: false,
      inspectionsOpenCount: 0,
      recalls: [],
      sources: [{ sourceType: "manual", reference: "seed", capturedAt: new Date() }],
    },
  },
  {
    email: "risk-sup-b@test.com",
    companyName: "Risk Demo Supplier B",
    metrics: {
      questionnaireOnTimeRate: 0.8,
      avgResponseHoursToFollowups: 60,
      capaOverdueCount: 2,
      capaReopenRate: 0.2,
      evidenceQualityScore: 70,
      docCompletenessScore: 68,
    },
    signals: {
      fda483CountRecent24m: 2,
      warningLetterRecent24m: false,
      importAlertActive: false,
      inspectionsOpenCount: 1,
      recalls: [{ class: "II", date: new Date("2024-06-01"), product: "API", note: "Recall class II" }],
      sources: [{ sourceType: "manual", reference: "seed", capturedAt: new Date() }],
    },
  },
  {
    email: "risk-sup-c@test.com",
    companyName: "Risk Demo Supplier C",
    metrics: {
      questionnaireOnTimeRate: 0.5,
      avgResponseHoursToFollowups: 140,
      capaOverdueCount: 5,
      capaReopenRate: 0.5,
      evidenceQualityScore: 40,
      docCompletenessScore: 35,
    },
    signals: {
      fda483CountRecent24m: 6,
      warningLetterRecent24m: true,
      importAlertActive: true,
      inspectionsOpenCount: 4,
      recalls: [
        { class: "I", date: new Date("2024-03-01"), product: "API", note: "Class I recall" },
        { class: "II", date: new Date("2024-05-01"), product: "API", note: "Class II recall" },
      ],
      sources: [{ sourceType: "manual", reference: "seed", capturedAt: new Date() }],
    },
  },
];

const ensureTenant = async () => {
  if (process.env.RISK_DEMO_TENANT_ID && mongoose.isValidObjectId(process.env.RISK_DEMO_TENANT_ID)) {
    const existing = await Tenant.findById(process.env.RISK_DEMO_TENANT_ID);
    if (existing) return existing;
  }
  let tenant = await Tenant.findOne({ name: "risk-demo-tenant" });
  if (!tenant) {
    tenant = await Tenant.create({
      name: "risk-demo-tenant",
      displayName: "Risk Demo Tenant",
      type: "BUYER",
      status: "ACTIVE",
    });
  }
  return tenant;
};

const ensureSupplierUser = async ({ email, tenantId }) => {
  let user = await User.findOne({ email, tenant_id: tenantId });
  if (!user) {
    const hashed = await bcrypt.hash("Test@2026", 10);
    user = await User.create({
      email,
      password: hashed,
      role: "supplier",
      tenant_id: tenantId,
      status: "ACTIVE",
      isEmailVerified: true,
    });
  }
  return user;
};

const ensureSupplierProfile = async (supplier, user, tenantId) => {
  const existing = await SupplierProfile.findOne({ user_id: user._id });
  const payload = {
    user_id: user._id,
    tenant_id: tenantId,
    title: "Mr",
    firstName: supplier.companyName.split(" ")[0] || "Supplier",
    lastName: "Admin",
    countryCode: "+1",
    phone: 9000000000,
    companyName: supplier.companyName,
    addressline1: "123 Demo Street",
    country: "USA",
    state: "CA",
    city: "San Diego",
    zipcode: "92101",
    isProfileCompleted: true,
  };
  if (existing) {
    await SupplierProfile.updateOne({ _id: existing._id }, { $set: payload });
    return existing;
  }
  return SupplierProfile.create(payload);
};

const main = async () => {
  ensureSafe();
  await connectDatabase();
  console.log("Connected to DB");

  const tenant = await ensureTenant();

  for (const supplier of SUPPLIERS) {
    const user = await ensureSupplierUser({ email: supplier.email, tenantId: tenant._id });
    await ensureSupplierProfile(supplier, user, tenant._id);
    await SupplierPublicSignal.findOneAndUpdate(
      { supplierId: user._id },
      { ...supplier.signals, supplierId: user._id, updatedBy: user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await SupplierRiskMetrics.findOneAndUpdate(
      { supplierId: user._id },
      { ...supplier.metrics, supplierId: user._id, computedFrom: "manual", updatedBy: user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await recalculateSupplierRisk({
      supplierId: user._id,
      actorUserId: user._id,
      eventType: "MANUAL_OVERRIDE",
      correlationId: `seed-risk-${Date.now()}`,
    });

    console.log(`Seeded risk data for ${supplier.email}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
};

main().catch((err) => {
  console.error("seed-risk-demo failed", err);
  process.exit(1);
});
