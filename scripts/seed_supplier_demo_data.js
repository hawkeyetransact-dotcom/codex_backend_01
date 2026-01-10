import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { User } from "../src/models/userModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { SupplierSite } from "../src/models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../src/models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../src/models/productSiteMappingModel.js";

const SUPPLIERS = [
  {
    email: "supplier1@test.com",
    companyName: "Dr Reddy's Laboratories",
    country: "India",
    state: "Telangana",
    city: "Hyderabad",
    addressline1: "8-2-337, Road No. 3, Banjara Hills",
    zipcode: "500034",
    plantPrefix: "DRD",
  },
  {
    email: "supplier2@test.com",
    companyName: "Aurobindo Pharma",
    country: "India",
    state: "Telangana",
    city: "Hyderabad",
    addressline1: "Plot No. 2, Survey No. 71",
    zipcode: "500090",
    plantPrefix: "AUR",
  },
  {
    email: "supplier3@test.com",
    companyName: "Sun Pharma",
    country: "India",
    state: "Gujarat",
    city: "Vadodara",
    addressline1: "Akota Road",
    zipcode: "390020",
    plantPrefix: "SUN",
  },
  {
    email: "supplier4@test.com",
    companyName: "Cipla",
    country: "India",
    state: "Maharashtra",
    city: "Mumbai",
    addressline1: "Cipla House, Peninsula Business Park",
    zipcode: "400013",
    plantPrefix: "CIP",
  },
  {
    email: "supplier5@test.com",
    companyName: "Lupin",
    country: "India",
    state: "Maharashtra",
    city: "Pune",
    addressline1: "Lupin Limited, Kalpataru Point",
    zipcode: "411001",
    plantPrefix: "LUP",
  },
];

const PRODUCT_SETS = [
  {
    name: "Metformin HCl",
    casNumber: "1115-70-4",
    apiTechnology: "Synthetic",
    dosageForm: "Tablet",
  },
  {
    name: "Atorvastatin",
    casNumber: "134523-00-5",
    apiTechnology: "Synthetic",
    dosageForm: "Tablet",
  },
  {
    name: "Amoxicillin",
    casNumber: "26787-78-0",
    apiTechnology: "Synthetic",
    dosageForm: "Capsule",
  },
  {
    name: "Amlodipine",
    casNumber: "111470-99-6",
    apiTechnology: "Synthetic",
    dosageForm: "Tablet",
  },
  {
    name: "Losartan",
    casNumber: "114798-26-4",
    apiTechnology: "Synthetic",
    dosageForm: "Tablet",
  },
];

const buildSites = (supplier, tenantId, userId) =>
  [1, 2, 3, 4, 5].map((idx) => ({
    tenant_id: tenantId,
    user_id: userId,
    site_name: `${supplier.companyName} Plant ${idx}`,
    address_line1: supplier.addressline1,
    city: supplier.city,
    state: supplier.state,
    country: supplier.country,
    zipcode: supplier.zipcode,
    contact_person_title: "Mr",
    contact_person_fname: "Plant",
    contact_person_lname: `Manager ${idx}`,
    contact_email: supplier.email,
    contact_phone_countryCode: "+91",
    contact_phone: `90000000${idx}`,
    gmp_audited: true,
    plant_id: `${supplier.plantPrefix}-PLANT-${String(idx).padStart(3, "0")}`,
  }));

const mappingPlan = (products, sites) =>
  products.map((product, idx) => ({ product, siteIndexes: [idx < sites.length ? idx : 0] }));

const ensureProfile = async (supplier, user, tenantId) => {
  const existing = await SupplierProfile.findOne({ user_id: user._id });
  if (!existing) {
    await SupplierProfile.create({
      user_id: user._id,
      tenant_id: tenantId,
      title: "Dr",
      firstName: supplier.companyName.split(" ")[0] || "Supplier",
      lastName: "Admin",
      countryCode: "+91",
      phone: 9000000000,
      companyName: supplier.companyName,
      addressline1: supplier.addressline1,
      country: supplier.country,
      state: supplier.state,
      city: supplier.city,
      zipcode: supplier.zipcode,
      isProfileCompleted: true,
    });
    return "created";
  }

  const updates = {
    tenant_id: tenantId,
    companyName: supplier.companyName,
    addressline1: supplier.addressline1,
    country: supplier.country,
    state: supplier.state,
    city: supplier.city,
    zipcode: supplier.zipcode,
  };
  await SupplierProfile.updateOne({ _id: existing._id }, { $set: updates });
  return "updated";
};

const ensureSite = async (site) => {
  const existing = await SupplierSite.findOne({ user_id: site.user_id, plant_id: site.plant_id });
  if (existing) return existing;
  return SupplierSite.create(site);
};

const ensureProduct = async (product) => {
  const existing = await SupplierMasterProducts.findOne({
    casNumber: product.casNumber,
    plant_id: product.plant_id,
  });
  if (existing) return existing;
  return SupplierMasterProducts.create(product);
};

const ensureMapping = async ({ userId, siteId, productId, apiMasterId }) => {
  const existing = await ProductSiteMappings.findOne({
    user_id: userId,
    site_id: siteId,
    product_id: productId,
  });
  if (existing) return existing;
  const conflict = await ProductSiteMappings.findOne({
    user_id: userId,
    site_id: siteId,
  });
  if (conflict) return conflict;
  return ProductSiteMappings.create({
    user_id: userId,
    site_id: siteId,
    product_id: productId,
    apiMasterId: apiMasterId || null,
    manufacturingRole: "API",
    visibility: "private",
  });
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");

  for (const [supplierIdx, supplier] of SUPPLIERS.entries()) {
    const user = await User.findOne({ email: supplier.email });
    if (!user) {
      console.warn("Missing supplier user", supplier.email);
      continue;
    }
    const tenantId = user.tenant_id;
    if (!tenantId) {
      console.warn("Missing tenant for", supplier.email);
      continue;
    }

    const profileStatus = await ensureProfile(supplier, user, tenantId);
    const siteDocs = [];
    const sites = buildSites(supplier, tenantId, user._id);
    for (const site of sites) {
      siteDocs.push(await ensureSite(site));
    }

    const productDocs = [];
    const casSuffix = supplierIdx === 0 ? "" : `-S${supplierIdx + 1}`;
    for (let i = 0; i < PRODUCT_SETS.length; i += 1) {
      const plantId = siteDocs[i]?.plant_id || sites[i].plant_id;
      const product = await ensureProduct({
        name: PRODUCT_SETS[i].name,
        casNumber: `${PRODUCT_SETS[i].casNumber}${casSuffix}`,
        description: `${PRODUCT_SETS[i].name} API`,
        apiTechnology: PRODUCT_SETS[i].apiTechnology,
        dosageForm: PRODUCT_SETS[i].dosageForm,
        plant_id: plantId,
        origin: "supplier_created",
      });
      productDocs.push(product);
    }

    const productIds = productDocs.map((p) => p._id);
    const existingMappings = await ProductSiteMappings.find({
      user_id: user._id,
      product_id: { $in: productIds },
    }).lean();
    const productMapCounts = new Map();
    for (const mapping of existingMappings) {
      productMapCounts.set(
        String(mapping.product_id),
        (productMapCounts.get(String(mapping.product_id)) || 0) + 1
      );
    }

    for (const item of mappingPlan(productDocs, siteDocs)) {
      const product = item.product;
      const existingMap = await ProductSiteMappings.findOne({
        user_id: user._id,
        product_id: product._id,
      });
      if (existingMap) continue;

      let chosenSite = null;
      for (const idx of item.siteIndexes) {
        const site = siteDocs[idx];
        if (!site) continue;
        const siteUsed = await ProductSiteMappings.findOne({
          user_id: user._id,
          site_id: site._id,
        });
        if (!siteUsed) {
          chosenSite = site;
          break;
        }
      }

      if (!chosenSite) {
        for (const site of siteDocs) {
          const siteUsed = await ProductSiteMappings.findOne({
            user_id: user._id,
            site_id: site._id,
          });
          if (!siteUsed) {
            chosenSite = site;
            break;
          }
        }
      }

      if (!chosenSite) {
        const spare = existingMappings.find(
          (mapping) => (productMapCounts.get(String(mapping.product_id)) || 0) > 1
        );
        if (spare) {
          await ProductSiteMappings.updateOne(
            { _id: spare._id },
            { $set: { product_id: product._id } }
          );
          productMapCounts.set(
            String(spare.product_id),
            (productMapCounts.get(String(spare.product_id)) || 1) - 1
          );
          productMapCounts.set(
            String(product._id),
            (productMapCounts.get(String(product._id)) || 0) + 1
          );
          console.log("Reassigned site mapping for", product.name, "using site", spare.site_id.toString());
          continue;
        }
        console.warn("No available site to map product", product.name, "for", supplier.email);
        continue;
      }

      await ensureMapping({
        userId: user._id,
        siteId: chosenSite._id,
        productId: product._id,
        apiMasterId: product.apiMasterId,
      });
      productMapCounts.set(String(product._id), (productMapCounts.get(String(product._id)) || 0) + 1);
    }

    console.log(
      `Seeded ${supplier.email}: profile=${profileStatus}, sites=${siteDocs.length}, products=${productDocs.length}`
    );
  }

  await mongoose.connection.close();
  console.log("Done");
};

main().catch((err) => {
  console.error("seed_supplier_demo_data failed", err);
  process.exit(1);
});
