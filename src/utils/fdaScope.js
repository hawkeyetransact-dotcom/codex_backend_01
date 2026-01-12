import { SupplierProfile } from "../models/supplierProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeTerm = (value) => String(value || "").trim();

const buildTerms = ({ profile, sites }) => {
  const terms = new Set();
  if (profile?.companyName) terms.add(normalizeTerm(profile.companyName));
  if (profile?.firstName && profile?.lastName) {
    terms.add(normalizeTerm(`${profile.firstName} ${profile.lastName}`));
  }
  if (profile?.firstName) terms.add(normalizeTerm(profile.firstName));
  if (profile?.lastName) terms.add(normalizeTerm(profile.lastName));
  (sites || []).forEach((site) => {
    if (site?.site_name) terms.add(normalizeTerm(site.site_name));
    if (site?.plant_id) terms.add(normalizeTerm(site.plant_id));
  });
  return Array.from(terms).filter((term) => term && term.length >= 3);
};

export const buildSupplierFdaFilter = async (req) => {
  const role = req.user?.role;
  if (role !== "supplier" && role !== "supplierUser") return null;

  const userId = req.user?._id;
  if (!userId) return { _id: { $exists: false } };

  const [profile, sites] = await Promise.all([
    SupplierProfile.findOne({ user_id: userId }).select("companyName firstName lastName").lean(),
    SupplierSite.find({ user_id: userId }).select("site_name plant_id").lean(),
  ]);

  const terms = buildTerms({ profile, sites });
  if (!terms.length) return { _id: { $exists: false } };

  const orFilters = terms.map((term) => ({
    legalName: { $regex: escapeRegex(term), $options: "i" },
  }));
  return { $or: orFilters };
};
