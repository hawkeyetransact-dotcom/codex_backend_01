import { PublicSupplier } from "../models/publicIntelModels.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import Tenant from "../models/tenantModel.js";
import { User } from "../models/userModel.js";
import bcrypt from "bcryptjs";

const mapOnboarded = (profiles = []) =>
  profiles.map((p) => ({
    _id: p._id,
    type: "onboarded",
    companyName: p.companyName,
    contactName: [p.title, p.firstName, p.lastName].filter(Boolean).join(" "),
    productCount: p.productCount || 0,
    siteCount: p.siteCount || 0,
    country: p.country,
  }));

const mapPublic = (items = []) =>
  items.map((p) => ({
    _id: p._id,
    type: "public",
    companyName: p.legal_name,
    country: p.country,
    signals: p.signals || {},
    claimed_status: p.claimed_status || "unclaimed",
  }));

export const getBuyerMarketplaceSuppliers = async (req, res) => {
  try {
    const [profiles, publics] = await Promise.all([
      SupplierProfile.aggregate([
        {
          $lookup: {
            from: "supplier-master-products",
            localField: "_id",
            foreignField: "supplier_id",
            as: "products",
          },
        },
        {
          $lookup: {
            from: "supplier-sites",
            localField: "_id",
            foreignField: "supplier_id",
            as: "sites",
          },
        },
        {
          $addFields: {
            productCount: { $size: "$products" },
            siteCount: { $size: "$sites" },
          },
        },
        { $limit: 200 },
      ]),
      PublicSupplier.find({}).limit(200).lean(),
    ]);

    res.json({
      data: {
        onboarded: mapOnboarded(profiles),
        public: mapPublic(publics),
      },
    });
  } catch (err) {
    console.error("getBuyerMarketplaceSuppliers", err);
    res.status(500).json({ error: "Failed to load marketplace suppliers" });
  }
};

export const invitePublicSupplier = async (req, res) => {
  try {
    const { publicSupplierId } = req.body || {};
    const tenantId = req.tenantId;
    if (!publicSupplierId) return res.status(400).json({ error: "publicSupplierId is required" });

    const pub = await PublicSupplier.findById(publicSupplierId).lean();
    if (!pub) return res.status(404).json({ error: "Public supplier not found" });

    // Create tenant/supplier profile placeholder if not exists
    let tenant = await Tenant.findOne({ name: pub.supplier_key });
    if (!tenant) {
      tenant = await Tenant.create({
        name: pub.supplier_key,
        displayName: pub.legal_name || "Supplier",
        type: "SUPPLIER",
        status: "ACTIVE",
      });
    }

    const existingProfile = await SupplierProfile.findOne({ tenant_id: tenant._id });
    if (!existingProfile) {
      await SupplierProfile.create({
        tenant_id: tenant._id,
        companyName: pub.legal_name,
        addressline1: "",
        country: pub.country,
        isProfileCompleted: false,
      });
    }

    // Create a user invite placeholder for supplier admin
    const email = `invite+${pub.supplier_key}@example.com`;
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      const hash = await bcrypt.hash("Temp@1234", 10);
      await User.create({
        email,
        password: hash,
        role: "supplier",
        tenant_id: tenant._id,
        adminScope: "NONE",
        status: "ACTIVE",
        isEmailVerified: false,
      });
    }

    await PublicSupplier.updateOne({ _id: publicSupplierId }, { $set: { claimed_status: "claimed" } });

    res.json({ success: true, message: "Invitation initiated" });
  } catch (err) {
    console.error("invitePublicSupplier", err);
    res.status(500).json({ error: "Failed to invite supplier" });
  }
};
