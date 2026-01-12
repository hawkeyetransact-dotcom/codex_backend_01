import mongoose from "mongoose";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { User } from "../models/userModel.js";
import { SupplierRiskSnapshot } from "../models/SupplierRiskSnapshot.js";
import { BuyerRiskProfile } from "../models/BuyerRiskProfile.js";
import { computeBuyerWeightedScore } from "../services/risk/buyerWeighting.js";

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const bySort = (field, order = "desc") => {
  const factor = order === "asc" ? 1 : -1;
  return (a, b) => {
    const av = a[field] ?? 0;
    const bv = b[field] ?? 0;
    if (av === bv) return 0;
    return av > bv ? factor : -factor;
  };
};

const getLatestSnapshots = async (supplierIds) => {
  if (!supplierIds.length) return {};
  const snapshots = await SupplierRiskSnapshot.aggregate([
    { $match: { supplierId: { $in: supplierIds } } },
    { $sort: { calculatedAt: -1 } },
    { $group: { _id: "$supplierId", doc: { $first: "$$ROOT" } } },
  ]);
  return snapshots.reduce((acc, item) => {
    acc[String(item._id)] = item.doc;
    return acc;
  }, {});
};

export const getBuyerRiskSummary = async (req, res) => {
  try {
    const { band, sort = "finalScore", order = "desc", q } = req.query || {};
    const tenantId = req.tenantId ? toObjectId(req.tenantId) : null;

    const profileQuery = {};
    if (tenantId) profileQuery.tenant_id = tenantId;
    if (q) {
      profileQuery.$or = [
        { companyName: new RegExp(q, "i") },
        { firstName: new RegExp(q, "i") },
        { lastName: new RegExp(q, "i") },
      ];
    }

    const profiles = await SupplierProfile.find(profileQuery).lean();
    const supplierIds = profiles.map((profile) => profile.user_id).filter(Boolean);

    const users = await User.find({ _id: { $in: supplierIds } }).select("email").lean();
    const emailMap = users.reduce((acc, user) => {
      acc[String(user._id)] = user.email;
      return acc;
    }, {});

    const snapshots = await getLatestSnapshots(supplierIds);

    const rows = profiles
      .map((profile) => {
        const supplierId = String(profile.user_id);
        const snapshot = snapshots[supplierId];
        return {
          supplierId,
          companyName: profile.companyName,
          contactName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
          email: emailMap[supplierId],
          riskBand: snapshot?.riskBand || "Unknown",
          finalScore: snapshot?.finalScore ?? null,
          finalScoreV2: snapshot?.finalScoreV2 ?? null,
          calculatedAt: snapshot?.calculatedAt || null,
          trend: snapshot?.v2?.riskTrendSlope || "FLAT",
        };
      })
      .filter((row) => {
        if (!band || band === "All") return true;
        return row.riskBand === band;
      })
      .sort(bySort(sort, order));

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("[risk] buyer summary", error);
    return res.status(500).json({ error: "Failed to load risk summary" });
  }
};

export const getBuyerRiskDetail = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });

    if (req.tenantId) {
      const profile = await SupplierProfile.findOne({ user_id: supplierId, tenant_id: req.tenantId }).lean();
      if (!profile) return res.status(404).json({ error: "Supplier not found" });
    }

    const snapshots = await SupplierRiskSnapshot.find({ supplierId })
      .sort({ calculatedAt: -1 })
      .limit(6)
      .lean();
    const latest = snapshots[0] || null;

    let buyerProfile = null;
    if (req.tenantId) {
      buyerProfile = await BuyerRiskProfile.findOne({ buyerTenantId: req.tenantId, isDefault: true }).lean();
    }

    const buyerSpecificScore = latest
      ? computeBuyerWeightedScore({ breakdown: latest.breakdown || {}, profile: buyerProfile })
      : null;

    return res.json({
      success: true,
      data: {
        supplierId: String(supplierId),
        latest,
        trend: snapshots,
        buyerSpecificScore,
        buyerProfile: buyerProfile ? { id: buyerProfile._id, name: buyerProfile.name } : null,
      },
    });
  } catch (error) {
    console.error("[risk] buyer detail", error);
    return res.status(500).json({ error: "Failed to load supplier risk" });
  }
};

export const listBuyerRiskProfiles = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const profiles = await BuyerRiskProfile.find({ buyerTenantId: req.tenantId }).lean();
    return res.json({ success: true, data: profiles });
  } catch (error) {
    console.error("[risk] buyer profiles", error);
    return res.status(500).json({ error: "Failed to load risk profiles" });
  }
};

export const createBuyerRiskProfile = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const payload = { ...req.body, buyerTenantId: req.tenantId, updatedAt: new Date(), updatedBy: req.user?._id };
    if (payload.isDefault) {
      await BuyerRiskProfile.updateMany({ buyerTenantId: req.tenantId }, { isDefault: false });
    }
    const profile = await BuyerRiskProfile.create(payload);
    return res.status(201).json({ success: true, data: profile });
  } catch (error) {
    console.error("[risk] create buyer profile", error);
    return res.status(500).json({ error: "Failed to create risk profile" });
  }
};

export const updateBuyerRiskProfile = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const profileId = toObjectId(req.params?.id);
    if (!profileId) return res.status(400).json({ error: "Invalid profile id" });

    if (req.body?.isDefault) {
      await BuyerRiskProfile.updateMany({ buyerTenantId: req.tenantId }, { isDefault: false });
    }

    const updated = await BuyerRiskProfile.findOneAndUpdate(
      { _id: profileId, buyerTenantId: req.tenantId },
      { ...req.body, updatedAt: new Date(), updatedBy: req.user?._id },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Risk profile not found" });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("[risk] update buyer profile", error);
    return res.status(500).json({ error: "Failed to update risk profile" });
  }
};
