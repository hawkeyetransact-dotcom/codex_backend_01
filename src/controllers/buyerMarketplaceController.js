import { PublicSupplier } from "../models/publicIntelModels.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { ReportInstance } from "../models/reportInstanceModel.js";
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
            from: "product-site-mappings",
            localField: "user_id",
            foreignField: "user_id",
            as: "mappings",
          },
        },
        {
          $lookup: {
            from: "supplier-sites",
            localField: "user_id",
            foreignField: "user_id",
            as: "sites",
          },
        },
        {
          $addFields: {
            productIds: { $setUnion: ["$mappings.product_id", []] },
            siteCount: { $size: "$sites" },
          },
        },
        {
          $addFields: {
            productCount: { $size: "$productIds" },
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

export const getBuyerMarketplaceSupplierSites = async (req, res) => {
  try {
    const supplierProfileId = req.params.id;
    if (!supplierProfileId) {
      return res.status(400).json({ error: "Supplier profile id is required" });
    }

    const profile = await SupplierProfile.findById(supplierProfileId).lean();
    if (!profile) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    const supplierUserId = profile.user_id;
    const sites = await SupplierSite.find({ user_id: supplierUserId })
      .select("site_name plant_id country")
      .lean();

    const mappings = await ProductSiteMappings.find({ user_id: supplierUserId })
      .populate("product_id", "name casNumber apiTechnology dosageForm")
      .populate("site_id", "site_name plant_id country")
      .lean();

    const productsBySite = new Map();
    for (const mapping of mappings) {
      const siteId = String(mapping.site_id?._id || "");
      if (!siteId || !mapping.product_id) continue;
      if (!productsBySite.has(siteId)) {
        productsBySite.set(siteId, new Map());
      }
      const productMap = productsBySite.get(siteId);
      productMap.set(String(mapping.product_id._id), {
        productId: mapping.product_id._id,
        name: mapping.product_id.name,
        casNumber: mapping.product_id.casNumber,
        apiTechnology: mapping.product_id.apiTechnology,
        dosageForm: mapping.product_id.dosageForm,
      });
    }

    const auditSnapshots = await AuditRequestMaster.aggregate([
      { $match: { supplier_id: supplierUserId } },
      { $sort: { updatedAt: -1 } },
      { $group: { _id: "$site_id", audit: { $first: "$$ROOT" } } },
      {
        $lookup: {
          from: "users",
          localField: "audit.auditor_id",
          foreignField: "_id",
          as: "auditor",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "audit.create_by_buyer_id",
          foreignField: "_id",
          as: "buyer",
        },
      },
      {
        $project: {
          siteId: "$_id",
          audit: 1,
          auditor: { $arrayElemAt: ["$auditor", 0] },
          buyer: { $arrayElemAt: ["$buyer", 0] },
        },
      },
    ]);

    const auditMap = new Map(
      auditSnapshots.map((entry) => [String(entry.siteId), entry])
    );

    const auditIds = auditSnapshots
      .map((entry) => entry?.audit?._id)
      .filter(Boolean);
    const reportInstances = auditIds.length
      ? await ReportInstance.find({ auditRequestId: { $in: auditIds } })
          .select("auditRequestId status exportHistory updatedAt")
          .sort({ updatedAt: -1 })
          .lean()
      : [];
    const reportMap = new Map();
    for (const report of reportInstances) {
      const key = String(report.auditRequestId);
      const existing = reportMap.get(key);
      if (!existing) {
        reportMap.set(key, report);
        continue;
      }
      if (existing.status !== "final" && report.status === "final") {
        reportMap.set(key, report);
      }
    }

    const isAuditCompleted = (audit) => {
      const raw = String(audit?.high_status || audit?.trackStatus || "").toLowerCase();
      if (raw.includes("complete") || raw.includes("closed")) return true;
      const numeric = Number(audit?.high_status);
      return Number.isFinite(numeric) && numeric >= 5;
    };

    const rows = sites.map((site) => {
      const auditEntry = auditMap.get(String(site._id));
      const audit = auditEntry?.audit;
      const auditor = auditEntry?.auditor;
      const buyer = auditEntry?.buyer;
      const products = productsBySite.get(String(site._id));
      const productCount = products ? products.size : 0;
      const completed = isAuditCompleted(audit);
      const report = audit?._id ? reportMap.get(String(audit._id)) : null;
      const exportHistory = report?.exportHistory || [];
      const reportUrl = completed && exportHistory.length ? exportHistory[exportHistory.length - 1].url : null;
      return {
        siteId: site._id,
        auditId: audit?._id || null,
        siteName: site.site_name,
        plantId: site.plant_id,
        country: site.country,
        productCount,
        lastAuditDate: audit?.updatedAt || audit?.complianceDate || null,
        lastAuditStatus: audit?.high_status || audit?.trackStatus || null,
        auditor: auditor?.email || auditor?.name || null,
        buyer: buyer?.email || buyer?.name || null,
        auditCompleted: completed,
        reportUrl,
        reportInstanceId: report?._id || null,
      };
    });

    return res.json({
      data: {
        supplier: {
          _id: profile._id,
          companyName: profile.companyName,
        },
        rows,
        productsBySite: Object.fromEntries(
          Array.from(productsBySite.entries()).map(([siteId, productMap]) => [
            siteId,
            Array.from(productMap.values()),
          ])
        ),
      },
    });
  } catch (err) {
    console.error("getBuyerMarketplaceSupplierSites", err);
    return res.status(500).json({ error: "Failed to load supplier sites" });
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
