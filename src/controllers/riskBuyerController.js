import mongoose from "mongoose";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { User } from "../models/userModel.js";
import { SupplierRiskSnapshot } from "../models/SupplierRiskSnapshot.js";
import { BuyerRiskProfile } from "../models/BuyerRiskProfile.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
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

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const dedupeObjectIds = (values = []) => {
  const seen = new Set();
  const list = [];
  values.forEach((value) => {
    const objectId = toObjectId(value);
    if (!objectId) return;
    const key = String(objectId);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(objectId);
  });
  return list;
};

const resolveBuyerMappedSupplierIds = async (req) => {
  const role = normalizeRole(req.user?.role);
  const scopeOr = [];

  if (req.tenantId) {
    scopeOr.push({ tenantOrgId: String(req.tenantId) });
  }

  if (role === "buyer" && req.user?._id) {
    scopeOr.push({ create_by_buyer_id: req.user._id });
  }

  if (!scopeOr.length) return [];

  const supplierIds = await AuditRequestMaster.distinct("supplier_id", {
    isArchived: { $ne: true },
    $or: scopeOr,
  });

  return dedupeObjectIds(supplierIds);
};

const rowMatchesQuery = (row, query) => {
  if (!query) return true;
  const regex = new RegExp(query, "i");
  return [row.companyName, row.contactName, row.email, row.supplierId].some((value) =>
    regex.test(String(value || ""))
  );
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
    const mappedSupplierIds = await resolveBuyerMappedSupplierIds(req);

    const usingMappedScope = mappedSupplierIds.length > 0;

    const profileQuery = usingMappedScope
      ? tenantId
        ? { $or: [{ user_id: { $in: mappedSupplierIds } }, { tenant_id: tenantId }] }
        : { user_id: { $in: mappedSupplierIds } }
      : {};
    if (!usingMappedScope && tenantId) profileQuery.tenant_id = tenantId;
    if (!usingMappedScope && q) {
      const queryRegex = new RegExp(q, "i");
      profileQuery.$or = [{ companyName: queryRegex }, { firstName: queryRegex }, { lastName: queryRegex }];
    }

    const profiles = await SupplierProfile.find(profileQuery).lean();
    const profileSupplierIds = profiles.map((profile) => profile.user_id).filter(Boolean);
    const supplierIds = dedupeObjectIds(
      usingMappedScope ? [...mappedSupplierIds, ...profileSupplierIds] : profileSupplierIds
    );

    const profileMap = profiles.reduce((acc, profile) => {
      if (profile?.user_id) acc[String(profile.user_id)] = profile;
      return acc;
    }, {});

    const users = await User.find({ _id: { $in: supplierIds } }).select("email").lean();
    const emailMap = users.reduce((acc, user) => {
      acc[String(user._id)] = user.email;
      return acc;
    }, {});

    const snapshots = await getLatestSnapshots(supplierIds);

    const rows = supplierIds
      .map((supplierObjectId) => {
        const supplierId = String(supplierObjectId);
        const profile = profileMap[supplierId];
        const snapshot = snapshots[supplierId];
        return {
          supplierId,
          companyName: profile?.companyName || "Unknown Supplier",
          contactName: `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
          email: emailMap[supplierId],
          riskBand: snapshot?.riskBand || "Unknown",
          finalScore: snapshot?.finalScore ?? null,
          finalScoreV2: snapshot?.finalScoreV2 ?? null,
          calculatedAt: snapshot?.calculatedAt || null,
          trend: snapshot?.v2?.riskTrendSlope || "FLAT",
        };
      })
      .filter((row) => rowMatchesQuery(row, q))
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
      const [tenantProfile, mappedSupplierIds] = await Promise.all([
        SupplierProfile.findOne({ user_id: supplierId, tenant_id: req.tenantId }).lean(),
        resolveBuyerMappedSupplierIds(req),
      ]);
      const mappedSet = new Set(mappedSupplierIds.map((value) => String(value)));
      if (!tenantProfile && !mappedSet.has(String(supplierId))) {
        return res.status(404).json({ error: "Supplier not found" });
      }
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
