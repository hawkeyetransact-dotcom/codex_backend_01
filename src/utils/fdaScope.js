import { SupplierProfile } from "../models/supplierProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeTerm = (value) => String(value || "").trim().replace(/\s+/g, " ");

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, "");

const isSupplierRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "supplier" || normalized === "supplieruser";
};

const tenantScoped = (query = {}, tenantId) => {
  if (!tenantId) return query;
  return { ...query, tenant_id: tenantId };
};

const toLegalNameRegex = (term) => {
  const escaped = escapeRegex(term);
  // Match complete words/phrases to avoid noisy substring matches across suppliers.
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i");
};

const buildTerms = ({ profile, sites }) => {
  const terms = new Set();
  if (profile?.companyName) terms.add(normalizeTerm(profile.companyName));
  (sites || []).forEach((site) => {
    if (site?.site_name) terms.add(normalizeTerm(site.site_name));
    if (site?.plant_id) terms.add(normalizeTerm(site.plant_id));
  });
  return Array.from(terms).filter((term) => term && term.length >= 4);
};

const resolveSupplierUserId = (user) => {
  if (!user) return null;
  if (normalizeRole(user.role) === "supplieruser" && user.invitedBy) return user.invitedBy;
  return user._id;
};

export const buildSupplierFdaFilter = async (req) => {
  const role = req.user?.role;
  if (!isSupplierRole(role)) return null;

  const userId = resolveSupplierUserId(req.user);
  const tenantId = req.tenantId || req.user?.tenant_id || null;
  if (!userId) return { _id: { $exists: false } };

  const [profile, sites] = await Promise.all([
    SupplierProfile.findOne(tenantScoped({ user_id: userId }, tenantId)).select("companyName").lean(),
    SupplierSite.find(tenantScoped({ user_id: userId }, tenantId)).select("site_name plant_id").lean(),
  ]);

  const terms = buildTerms({ profile, sites });
  if (!terms.length) return { _id: { $exists: false } };

  const orFilters = terms.map((term) => ({
    legalName: { $regex: toLegalNameRegex(term) },
  }));
  return { $or: orFilters };
};
