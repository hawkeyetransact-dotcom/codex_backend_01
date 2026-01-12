import { SupplierRiskSnapshot } from "../models/SupplierRiskSnapshot.js";
import { buildImprovementChecklist } from "../services/risk/improvements.js";

const resolveSupplierId = (user) => {
  if (!user) return null;
  if (user.role === "supplierUser" && user.invitedBy) return user.invitedBy;
  return user._id;
};

export const getSupplierRisk = async (req, res) => {
  try {
    const supplierId = resolveSupplierId(req.user);
    if (!supplierId) return res.status(400).json({ error: "Supplier context missing" });

    const latest = await SupplierRiskSnapshot.findOne({ supplierId })
      .sort({ calculatedAt: -1 })
      .lean();
    const trend = await SupplierRiskSnapshot.find({ supplierId })
      .sort({ calculatedAt: -1 })
      .limit(6)
      .lean();

    const checklist = latest ? buildImprovementChecklist(latest.breakdown || {}) : [];

    return res.json({
      success: true,
      data: {
        latest,
        trend,
        improvements: checklist,
      },
    });
  } catch (error) {
    console.error("[risk] supplier view", error);
    return res.status(500).json({ error: "Failed to load risk view" });
  }
};
