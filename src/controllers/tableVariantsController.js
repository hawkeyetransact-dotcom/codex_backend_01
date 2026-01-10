import { TableVariant } from "../models/tableVariantModel.js";

const isPlatformAdmin = (req) => req?.adminScope === "PLATFORM";
const isTenantAdmin = (req) =>
  req?.user && ["tenant_admin", "admin", "superadmin"].includes(req.user.role) && req.adminScope !== "NONE";

const scopeFilter = ({ tableKey, tenantId, userId }) => ({
  tableKey,
  $or: [
    { scope: "SYSTEM" },
    { scope: "TENANT", tenantId },
    { scope: "USER", tenantId, ownerUserId: userId },
  ],
});

const resolveEffectiveDefault = (variants, tenantId, userId) => {
  const userDefault = variants.find(
    (v) => v.scope === "USER" && String(v.ownerUserId || "") === String(userId) && v.isDefault
  );
  if (userDefault) return userDefault;
  const tenantDefault = variants.find(
    (v) => v.scope === "TENANT" && String(v.tenantId || "") === String(tenantId) && v.isDefault
  );
  if (tenantDefault) return tenantDefault;
  return variants.find((v) => v.scope === "SYSTEM" && v.isDefault) || null;
};

const enforceDefaultUniqueness = async ({ tableKey, scope, tenantId, ownerUserId, excludeId }) => {
  const query = { tableKey, scope };
  if (scope === "TENANT") query.tenantId = tenantId;
  if (scope === "USER") {
    query.tenantId = tenantId;
    query.ownerUserId = ownerUserId;
  }
  if (excludeId) query._id = { $ne: excludeId };
  await TableVariant.updateMany(query, { $set: { isDefault: false } });
};

export const listTableVariants = async (req, res) => {
  const { tableKey } = req.query;
  if (!tableKey) return res.status(400).json({ message: "tableKey is required" });
  const tenantId = req.tenantId || null;
  const userId = req.user?._id;
  if (!tenantId && !isPlatformAdmin(req)) {
    return res.status(400).json({ message: "Tenant context missing" });
  }

  const query = tenantId ? scopeFilter({ tableKey, tenantId, userId }) : { tableKey, scope: "SYSTEM" };
  const variants = await TableVariant.find(query).sort({ scope: 1, name: 1 }).lean();
  const effectiveDefault = tenantId ? resolveEffectiveDefault(variants, tenantId, userId) : resolveEffectiveDefault(variants, null, null);
  return res.json({ data: variants, effectiveDefault });
};

export const createTableVariant = async (req, res) => {
  try {
    const { tableKey, scope, name, config, isDefault } = req.body || {};
    if (!tableKey || !scope || !name) {
      return res.status(400).json({ message: "tableKey, scope, and name are required" });
    }

    const tenantId = req.tenantId || null;
    if (!tenantId && scope !== "SYSTEM") {
      return res.status(400).json({ message: "Tenant context missing" });
    }

    if (scope === "SYSTEM" && !isPlatformAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (scope === "TENANT" && !isTenantAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const ownerUserId = scope === "USER" ? req.user?._id : null;
    if (scope === "USER" && !ownerUserId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (isDefault) {
      await enforceDefaultUniqueness({ tableKey, scope, tenantId, ownerUserId });
    }

    const variant = await TableVariant.create({
      tableKey,
      scope,
      name,
      config,
      isDefault: Boolean(isDefault),
      tenantId: scope === "SYSTEM" ? null : tenantId,
      ownerUserId,
    });
    return res.status(201).json({ data: variant });
  } catch (err) {
    console.error("createTableVariant", err);
    return res.status(500).json({ message: err.message });
  }
};

export const updateTableVariant = async (req, res) => {
  try {
    const variant = await TableVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Not found" });

    if (variant.scope === "SYSTEM" && !isPlatformAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (variant.scope === "TENANT" && !isTenantAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (variant.scope === "USER" && String(variant.ownerUserId || "") !== String(req.user?._id || "")) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { name, config, isDefault } = req.body || {};
    if (typeof isDefault === "boolean" && isDefault) {
      await enforceDefaultUniqueness({
        tableKey: variant.tableKey,
        scope: variant.scope,
        tenantId: variant.tenantId,
        ownerUserId: variant.ownerUserId,
        excludeId: variant._id,
      });
    }

    variant.name = name ?? variant.name;
    variant.config = config ?? variant.config;
    if (typeof isDefault === "boolean") variant.isDefault = isDefault;
    await variant.save();
    return res.json({ data: variant });
  } catch (err) {
    console.error("updateTableVariant", err);
    return res.status(500).json({ message: err.message });
  }
};

export const deleteTableVariant = async (req, res) => {
  try {
    const variant = await TableVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: "Not found" });

    if (variant.scope === "SYSTEM" && !isPlatformAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (variant.scope === "TENANT" && !isTenantAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (variant.scope === "USER" && String(variant.ownerUserId || "") !== String(req.user?._id || "")) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await TableVariant.deleteOne({ _id: variant._id });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteTableVariant", err);
    return res.status(500).json({ message: err.message });
  }
};
