import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Tenant from "../models/tenantModel.js";
import { User } from "../models/userModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { Template } from "../models/templateModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { Categories } from "../models/categoriesModel.js";
import { processQuestionnaireUpload } from "../services/questionnaireExtractionService.js";

const seedGuard = (req) => {
  if (process.env.NODE_ENV === "production") throw new Error("Not allowed in production");
  const secret = process.env.E2E_SEED_SECRET || process.env.DEV_SEED_SECRET || "devseed";
  if (req.headers["x-seed-secret"] !== secret) throw new Error("Forbidden");
  const uri = process.env.MONGO_URI || "";
  if (!uri.includes("hawkeye_test") && process.env.E2E_ALLOW_NON_TEST !== "true") {
    throw new Error("Refusing to seed non-test database");
  }
};

const normalizeQuestionText = (text = "") => text.toLowerCase().replace(/[\W_]+/g, "").trim();

const ensureTemplateQuestions = async () => {
  const templateId = 3;
  const existingCount = await TemplateQuestions.countDocuments({ templateId });
  if (existingCount > 0) {
    return { templateId, questionCount: existingCount, created: false };
  }

  const filePath = path.join(
    process.cwd(),
    "test",
    "Full PSCI SAQ & Audit Report Template for Core Suppliers, External Manufacturers, Component and Material Suppliers (WORD VERSION).docx"
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`Questionnaire file not found at ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const file = {
    buffer,
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    originalname: path.basename(filePath),
    size: buffer.length,
  };

  const parsed = await processQuestionnaireUpload({ file, defaultCategory: "General" });
  const questions = parsed.questions || [];
  if (!questions.length) {
    throw new Error("No questions extracted from questionnaire");
  }

  const categoryNames = Array.from(new Set(questions.map((q) => q.categoryName || "Uncategorized")));
  const existingCats = await Categories.find({ name: { $in: categoryNames } }).lean();
  const catMap = new Map(existingCats.map((c) => [c.name, c._id]));
  const toInsert = categoryNames.filter((name) => !catMap.has(name)).map((name) => ({ name }));
  if (toInsert.length) {
    const inserted = await Categories.insertMany(toInsert);
    inserted.forEach((c) => catMap.set(c.name, c._id));
  }

  const docs = questions.map((q, idx) => ({
    question: q.question,
    categoryName: q.categoryName || "Uncategorized",
    subCategoryName: q.subCategoryName || "",
    templateId,
    categoryId: q.categoryId || catMap.get(q.categoryName || "Uncategorized") || new mongoose.Types.ObjectId(),
    riskcategory: q.riskcategory || "",
    Audittype: q.Audittype || "",
    industry: q.industry || "",
    Physical: "Y",
    normalizedQuestion: normalizeQuestionText(q.question || ""),
    responseSchema: q.responseSchema || {},
    answerType: q.answerType || "text",
    options: q.options || [],
    helperText: q.helperText || "",
    subQuestions: q.subQuestions || [],
    extractionHints: q.extractionHints || {},
    answerMapping: q.answerMapping || {},
    order: Number.isFinite(q.order) ? q.order : idx,
    version: 1,
  }));

  await TemplateQuestions.insertMany(docs);
  await Template.findOneAndUpdate(
    { templateId },
    { $set: { name: "PSCI SAQ Core Suppliers", categories: categoryNames } },
    { upsert: true, new: true }
  );

  return { templateId, questionCount: docs.length, created: true };
};

const ensureUser = async ({ email, role, tenantId, adminScope = "NONE" }) => {
  const password = await bcrypt.hash("Test@2026", 10);
  return User.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        role,
        tenant_id: tenantId,
        adminScope,
        status: "ACTIVE",
        isEmailVerified: true,
        password,
      },
    },
    { upsert: true, new: true }
  );
};

const ensureSupplierUser = async (tenantId) => {
  const usedSupplierIds = await SupplierProfile.distinct("user_id");
  let supplierUser = await User.findOne({ role: "supplier", _id: { $nin: usedSupplierIds } });
  let created = false;
  if (!supplierUser) {
    supplierUser = await ensureUser({
      email: "sai-supplier-admin@test.com",
      role: "supplier",
      tenantId,
    });
    created = true;
  } else {
    supplierUser = await ensureUser({
      email: supplierUser.email,
      role: "supplier",
      tenantId,
    });
  }
  return { supplierUser, created };
};

export const seedSaiLifeSciences = async (req, res) => {
  try {
    seedGuard(req);

    const tenant = await Tenant.findOneAndUpdate(
      { name: "sai-life-buyer" },
      {
        $set: {
          displayName: "Sai Life Buyer",
          type: "BUYER",
          status: "ACTIVE",
        },
      },
      { upsert: true, new: true }
    );

    const buyer = await ensureUser({ email: "buyer4@test.com", role: "buyer", tenantId: tenant._id });
    const auditor = await ensureUser({ email: "auditor4@test.com", role: "auditor", tenantId: tenant._id });
    const supplierResult = await ensureSupplierUser(tenant._id);
    const supplierUser = supplierResult.supplierUser;

    const buyerProfile = await BuyerProfile.findOneAndUpdate(
      { user_id: buyer._id },
      {
        $set: {
          user_id: buyer._id,
          tenant_id: tenant._id,
          title: "Mr",
          firstName: "Buyer",
          lastName: "Four",
          countryCode: "+91",
          phone: 9999999999,
          companyName: "Buyer Test Org",
          addressline1: "Test Road",
          zipcode: "500078",
          isProfileCompleted: true,
        },
      },
      { upsert: true, new: true }
    );

    const auditorProfile = await AuditorProfile.findOneAndUpdate(
      { user_id: auditor._id },
      {
        $set: {
          user_id: auditor._id,
          tenant_id: tenant._id,
          title: "Mr",
          firstName: "Auditor",
          lastName: "Four",
          countryCode: "+91",
          phone: 9999999998,
          companyName: "Audit Test Org",
          addressline1: "Audit Road",
          zipcode: "500078",
          isProfileCompleted: true,
        },
      },
      { upsert: true, new: true }
    );

    const supplierProfile = await SupplierProfile.findOneAndUpdate(
      { user_id: supplierUser._id },
      {
        $set: {
          user_id: supplierUser._id,
          tenant_id: tenant._id,
          title: "Mr",
          firstName: "Sai",
          lastName: "LifeSciences",
          countryCode: "+91",
          phone: 8482232789,
          companyName: "Sai LifeSciences",
          addressline1: "Plot No: 79A, 79B, 80A, 80B, 81A & 82",
          addressline2: "Kolhar Industrial Area, Bidar",
          addressline3: "Bidar District, Karnataka, India",
          city: "Bidar",
          state: "Karnataka",
          country: "India",
          zipcode: "585403",
          isProfileCompleted: true,
        },
      },
      { upsert: true, new: true }
    );

    const site = await SupplierSite.findOneAndUpdate(
      { plant_id: "91-585-0412", user_id: supplierUser._id },
      {
        $set: {
          tenant_id: tenant._id,
          user_id: supplierUser._id,
          site_name: "Sai Life Sciences Limited, Unit-IV",
          address_line1: "Plot No: 79A, 79B, 80A, 80B, 81A & 82",
          address_line2: "Kolhar Industrial Area, Bidar",
          address_line3: "Bidar District, Karnataka, India",
          city: "Bidar",
          state: "Karnataka",
          country: "India",
          zipcode: "585403",
          contact_person_title: "Mr",
          contact_person_fname: "Ramesh",
          contact_person_lname: "Mathamsetti",
          contact_email: supplierUser.email,
          contact_phone_countryCode: "+91",
          contact_phone: "8482232789",
          gmp_audited: true,
        },
      },
      { upsert: true, new: true }
    );

    const productNames = ["BCX 6494", "BCX 7611"];
    const products = [];
    for (const name of productNames) {
      const product = await SupplierMasterProducts.findOneAndUpdate(
        { name, plant_id: site.plant_id },
        {
          $set: {
            name,
            casNumber: "N/A",
            description: "Seeded from Sai LifeSciences audit report",
            apiTechnology: "Synthetic",
            dosageForm: "API",
            plant_id: site.plant_id,
          },
        },
        { upsert: true, new: true }
      );
      products.push(product);
      await ProductSiteMappings.findOneAndUpdate(
        { user_id: supplierUser._id, site_id: site._id, product_id: product._id },
        {
          $setOnInsert: {
            user_id: supplierUser._id,
            site_id: site._id,
            product_id: product._id,
            apiMasterId: product._id,
          },
        },
        { upsert: true, new: true }
      );
    }

    const template = await ensureTemplateQuestions();

    return res.json({
      success: true,
      data: {
        tenant: { id: tenant._id, name: tenant.name },
        buyer: { id: buyer._id, email: buyer.email },
        auditor: { id: auditor._id, email: auditor.email },
        supplierUser: { id: supplierUser._id, email: supplierUser.email, created: supplierResult.created },
        supplierProfile: { id: supplierProfile._id, companyName: supplierProfile.companyName },
        site: { id: site._id, site_name: site.site_name, plant_id: site.plant_id },
        products: products.map((p) => ({ id: p._id, name: p.name })),
        template,
      },
    });
  } catch (err) {
    console.error("seedSaiLifeSciences error", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
