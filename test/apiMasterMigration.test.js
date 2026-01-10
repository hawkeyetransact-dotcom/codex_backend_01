import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ApiMaster } from "../src/models/apiMasterModel.js";
import { SupplierMasterProducts } from "../src/models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../src/models/productSiteMappingModel.js";
import { SupplierSite } from "../src/models/supplierSiteDataModel.js";
import { User } from "../src/models/userModel.js";
import Tenant from "../src/models/tenantModel.js";
import { runMigration } from "../scripts/migrateToApiMaster.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenant = await Tenant.create({
    name: "supplier-tenant",
    displayName: "Supplier Tenant",
    type: "SUPPLIER",
    status: "ACTIVE",
  });
  const supplier = await User.create({
    email: "supplier@test.com",
    password: "secret",
    role: "supplier",
    status: "ACTIVE",
    tenant_id: tenant._id,
    isEmailVerified: true,
  });
  const site = await SupplierSite.create({
    user_id: supplier._id,
    tenant_id: tenant._id,
    site_name: "Plant A",
    address_line1: "123 Road",
    city: "City",
    state: "State",
    country: "USA",
    zipcode: "12345",
    contact_person_title: "Mr",
    contact_person_fname: "Supplier",
    contact_person_lname: "One",
    contact_email: "supplier@test.com",
    contact_phone_countryCode: "+1",
    contact_phone: "1234567890",
    plant_id: "PLANT-1",
  });
  const product = await SupplierMasterProducts.create({
    name: "Metformin HCl",
    casNumber: "111-11-1",
    apiTechnology: "Synthetic",
    dosageForm: "Tablet",
    plant_id: "PLANT-1",
  });
  await ProductSiteMappings.create({
    user_id: supplier._id,
    site_id: site._id,
    product_id: product._id,
  });

  const result = await runMigration({ createIndexes: false });
  assert.strictEqual(result.productCount, 1);
  assert.ok(result.apiMastersCreated >= 1);

  const apiMaster = await ApiMaster.findOne({ normalizedKey: "metformin hcl" }).lean();
  assert.ok(apiMaster);

  const updatedProduct = await SupplierMasterProducts.findById(product._id).lean();
  assert.ok(updatedProduct?.apiMasterId);
  assert.strictEqual(String(updatedProduct.apiMasterId), String(apiMaster._id));

  const mapping = await ProductSiteMappings.findOne({ product_id: product._id }).lean();
  assert.ok(mapping?.apiMasterId);

  await mongoose.disconnect();
  await mongoServer.stop();
};

run();
