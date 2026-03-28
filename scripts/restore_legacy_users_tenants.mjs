import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
await client.connect();

const dbName = new URL(MONGO_URI.replace("mongodb+srv://", "https://")).pathname.slice(1).split("?")[0];
const db = client.db(dbName);
console.log("Connected to DB:", dbName);

const hash = await bcrypt.hash("Testing@2022", 10);

// ── TENANTS ──────────────────────────────────────────────────────────────────
const tenantsToRestore = [
  { _id: "695c82c5d713167e90f60bb3", name: "buyer-co-tenant",       displayName: "Buyer Co",                type: "BUYER"    },
  { _id: "695c82c5d713167e90f60bb5", name: "supplier-co-tenant",    displayName: "Supplier Co",             type: "SUPPLIER" },
  { _id: "695e3fe09f8fa7d22e1dd4d7", name: "seed-tenant-01-legacy", displayName: "Seed Tenant 01 Legacy",   type: "BUYER"    },
  { _id: "695e40079f8fa7d22e1dd4f4", name: "seed-tenant-02-legacy", displayName: "Seed Tenant 02 Legacy",   type: "BUYER"    },
  { _id: "695e401f9f8fa7d22e1dd50c", name: "seed-tenant-03-legacy", displayName: "Seed Tenant 03 Legacy",   type: "BUYER"    },
  { _id: "695e40369f8fa7d22e1dd524", name: "seed-tenant-04-legacy", displayName: "Seed Tenant 04 Legacy",   type: "BUYER"    },
  { _id: "695e409982072766a1d14a61", name: "seed-tenant-05-legacy", displayName: "Seed Tenant 05 Legacy",   type: "BUYER"    },
  { _id: "695e420252203776e0670e58", name: "buyer-org-1",           displayName: "Buyer Org 1",             type: "BUYER"    },
  { _id: "695e429fe4d2a8a06f935ca9", name: "buyer-org-3",           displayName: "Buyer Org 3",             type: "BUYER"    },
  { _id: "695e4361e4d2a8a06f935cc4", name: "buyer-org-4",           displayName: "Buyer Org 4",             type: "BUYER"    },
  { _id: "695e4387e4d2a8a06f935cdf", name: "buyer-org-5",           displayName: "Buyer Org 5",             type: "BUYER"    },
  { _id: "695e41f752203776e0670e50", name: "dr-reddys-tenant",      displayName: "Dr Reddys Laboratories",  type: "SUPPLIER" },
  { _id: "695e421752203776e0670e73", name: "aurobindo-tenant",      displayName: "Aurobindo Pharma",        type: "SUPPLIER" },
  { _id: "695e429ce4d2a8a06f935ca6", name: "sun-pharma-tenant",     displayName: "Sun Pharma",             type: "SUPPLIER" },
  { _id: "695e435ce4d2a8a06f935cc1", name: "cipla-tenant",          displayName: "Cipla",                   type: "SUPPLIER" },
  { _id: "695e4382e4d2a8a06f935cdc", name: "lupin-tenant",          displayName: "Lupin",                   type: "SUPPLIER" },
  { _id: "695e420452203776e0670e5b", name: "auditor-org-1",         displayName: "Auditor Org 1",           type: "AUDITOR"  },
  { _id: "695e42a1e4d2a8a06f935cac", name: "auditor-org-3",         displayName: "Auditor Org 3",           type: "AUDITOR"  },
  { _id: "695e4365e4d2a8a06f935cc7", name: "auditor-org-4",         displayName: "Auditor Org 4",           type: "AUDITOR"  },
  { _id: "695e43e72c8c9d75c8dfe4d2", name: "auditor-org-5",         displayName: "Auditor Org 5",           type: "AUDITOR"  },
  { _id: "69a98ea8c75248020ae2a777", name: "sai-life-1",            displayName: "Sai Life Sciences 1",    type: "SUPPLIER" },
  { _id: "69a99e73c75248020ae2b3d3", name: "sai-life-2",            displayName: "Sai Life Sciences 2",    type: "SUPPLIER" },
  { _id: "69b18df57dc0202e3e29f7fc", name: "cdmo1-tenant",          displayName: "CDMO1",                  type: "BUYER"    },
  { _id: "69b18f5b7dc0202e3e29f817", name: "cdmo2-tenant",          displayName: "CDMO2",                  type: "SUPPLIER" },
  { _id: "69b18fdf7dc0202e3e29f82c", name: "contract-lab-tenant",   displayName: "Contract Lab Org",        type: "SUPPLIER" },
];

let tenantInserted = 0;
for (const t of tenantsToRestore) {
  const exists = await db.collection("tenants").findOne({ _id: new ObjectId(t._id) });
  if (!exists) {
    await db.collection("tenants").insertOne({
      _id: new ObjectId(t._id),
      name: t.name,
      displayName: t.displayName,
      type: t.type,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tenantInserted++;
  }
}
console.log("Tenants restored: " + tenantInserted + " / " + tenantsToRestore.length);

// ── USERS ─────────────────────────────────────────────────────────────────────
const usersToRestore = [
  { _id: "695c82c5d713167e90f60bb9", email: "buyer.one@legacy.test",         role: "buyer",    tenantId: "695c82c5d713167e90f60bb3" },
  { _id: "695e3fee9f8fa7d22e1dd4e2", email: "buyer.seed01@legacy.test",      role: "buyer",    tenantId: "695e3fe09f8fa7d22e1dd4d7" },
  { _id: "695e400f9f8fa7d22e1dd4fa", email: "buyer.seed02@legacy.test",      role: "buyer",    tenantId: "695e40079f8fa7d22e1dd4f4" },
  { _id: "695e40239f8fa7d22e1dd512", email: "buyer.seed03@legacy.test",      role: "buyer",    tenantId: "695e401f9f8fa7d22e1dd50c" },
  { _id: "695e403d9f8fa7d22e1dd52a", email: "buyer.seed04@legacy.test",      role: "buyer",    tenantId: "695e40369f8fa7d22e1dd524" },
  { _id: "695e409c82072766a1d14a67", email: "buyer.seed05@legacy.test",      role: "buyer",    tenantId: "695e409982072766a1d14a61" },
  { _id: "695e420a52203776e0670e63", email: "buyer1.org@legacy.test",        role: "buyer",    tenantId: "695e420252203776e0670e58" },
  { _id: "695e42a7e4d2a8a06f935cb2", email: "buyer3.org@legacy.test",        role: "buyer",    tenantId: "695e429fe4d2a8a06f935ca9" },
  { _id: "695e436de4d2a8a06f935ccd", email: "buyer4.org@legacy.test",        role: "buyer",    tenantId: "695e4361e4d2a8a06f935cc4" },
  { _id: "695e43ec2c8c9d75c8dfe4d8", email: "buyer5.org@legacy.test",        role: "buyer",    tenantId: "695e4387e4d2a8a06f935cdf" },
  { _id: "69b18df81e2442e5a4cc4253", email: "cdmo1.procurement@legacy.test", role: "buyer",    tenantId: "69b18df57dc0202e3e29f7fc" },
  { _id: "695c82c5d713167e90f60bbb", email: "supplier.one@legacy.test",      role: "supplier", tenantId: "695e421752203776e0670e73" },
  { _id: "695e3ff29f8fa7d22e1dd4e5", email: "supplier.seed01@legacy.test",   role: "supplier", tenantId: "695e3fe09f8fa7d22e1dd4d7" },
  { _id: "695e40129f8fa7d22e1dd4fd", email: "supplier.seed02@legacy.test",   role: "supplier", tenantId: "695e40079f8fa7d22e1dd4f4" },
  { _id: "695e40279f8fa7d22e1dd515", email: "supplier.seed03@legacy.test",   role: "supplier", tenantId: "695e401f9f8fa7d22e1dd50c" },
  { _id: "695e40429f8fa7d22e1dd52d", email: "supplier.seed04@legacy.test",   role: "supplier", tenantId: "695e40369f8fa7d22e1dd524" },
  { _id: "695e409e82072766a1d14a6a", email: "supplier.seed05@legacy.test",   role: "supplier", tenantId: "695e409982072766a1d14a61" },
  { _id: "695e420752203776e0670e5f", email: "dr.reddys@legacy.test",         role: "supplier", tenantId: "695e41f752203776e0670e50" },
  { _id: "695e42a4e4d2a8a06f935caf", email: "sun.pharma@legacy.test",        role: "supplier", tenantId: "695e429ce4d2a8a06f935ca6" },
  { _id: "695e4369e4d2a8a06f935cca", email: "cipla@legacy.test",             role: "supplier", tenantId: "695e435ce4d2a8a06f935cc1" },
  { _id: "695e43ea2c8c9d75c8dfe4d5", email: "lupin@legacy.test",             role: "supplier", tenantId: "695e4382e4d2a8a06f935cdc" },
  { _id: "69a98ea9c75248020ae2a77c", email: "ramesh.sailife1@legacy.test",   role: "supplier", tenantId: "69a98ea8c75248020ae2a777" },
  { _id: "69a99e74c75248020ae2b3d8", email: "ramesh.sailife2@legacy.test",   role: "supplier", tenantId: "69a99e73c75248020ae2b3d3" },
  { _id: "69b18df61e2442e5a4cc424b", email: "cdmo1.supplier@legacy.test",    role: "supplier", tenantId: "69b18df57dc0202e3e29f7fc" },
  { _id: "69b18f5c2b96a5020b8eeab2", email: "cdmo2.supplier@legacy.test",    role: "supplier", tenantId: "69b18f5b7dc0202e3e29f817" },
  { _id: "69b18fe008bd8c3a70c7f5be", email: "contractlab.admin@legacy.test", role: "supplier", tenantId: "69b18fdf7dc0202e3e29f82c" },
  { _id: "695c82c5d713167e90f60bbd", email: "auditor.one@legacy.test",       role: "auditor",  tenantId: "695c82c5d713167e90f60bb3" },
  { _id: "695e3ff69f8fa7d22e1dd4e8", email: "auditor.seed01@legacy.test",    role: "auditor",  tenantId: "695e3fe09f8fa7d22e1dd4d7" },
  { _id: "695e40179f8fa7d22e1dd500", email: "auditor.seed02@legacy.test",    role: "auditor",  tenantId: "695e40079f8fa7d22e1dd4f4" },
  { _id: "695e402d9f8fa7d22e1dd518", email: "auditor.seed03@legacy.test",    role: "auditor",  tenantId: "695e401f9f8fa7d22e1dd50c" },
  { _id: "695e40469f8fa7d22e1dd530", email: "auditor.seed04@legacy.test",    role: "auditor",  tenantId: "695e40369f8fa7d22e1dd524" },
  { _id: "695e40a082072766a1d14a6d", email: "auditor.seed05@legacy.test",    role: "auditor",  tenantId: "695e409982072766a1d14a61" },
  { _id: "695e420e52203776e0670e67", email: "auditor1.org@legacy.test",      role: "auditor",  tenantId: "695e420452203776e0670e5b" },
  { _id: "695e42aae4d2a8a06f935cb5", email: "auditor3.org@legacy.test",      role: "auditor",  tenantId: "695e42a1e4d2a8a06f935cac" },
  { _id: "695e4372e4d2a8a06f935cd0", email: "auditor4.org@legacy.test",      role: "auditor",  tenantId: "695e4365e4d2a8a06f935cc7" },
  { _id: "695e43ee2c8c9d75c8dfe4db", email: "auditor5.org@legacy.test",      role: "auditor",  tenantId: "695e43e72c8c9d75c8dfe4d2" },
];

let userInserted = 0;
for (const u of usersToRestore) {
  const exists = await db.collection("users").findOne({ _id: new ObjectId(u._id) });
  if (!exists) {
    await db.collection("users").insertOne({
      _id: new ObjectId(u._id),
      email: u.email,
      password: hash,
      role: u.role,
      tenant_id: new ObjectId(u.tenantId),
      adminScope: "NONE",
      status: "ACTIVE",
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userInserted++;
  }
}
console.log("Users restored: " + userInserted + " / " + usersToRestore.length);

const totalUsers   = await db.collection("users").countDocuments();
const totalTenants = await db.collection("tenants").countDocuments();
console.log("hawkeye.users total:   " + totalUsers);
console.log("hawkeye.tenants total: " + totalTenants);
await client.close();
