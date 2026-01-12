import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { IntegrationProvider } from "../src/models/integrationProviderModel.js";
import { IntegrationConnection } from "../src/models/integrationConnectionModel.js";
import { IntegrationMappingConfig } from "../src/models/integrationMappingConfigModel.js";
import { User } from "../src/models/userModel.js";

const isLocalUri = (uri) => /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(uri || "");

const ensureSafe = () => {
  if (process.env.USE_MEMORY_DB === "true") return;
  const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI || "";
  if (process.env.INTEGRATION_SEED_ALLOW === "true") return;
  if (!isLocalUri(mongoUri)) {
    console.error("Refusing to seed integration demo data on non-local database.");
    console.error("Set INTEGRATION_SEED_ALLOW=true to override, or use a localhost Mongo URI.");
    process.exit(1);
  }
};

const PROVIDERS = [
  {
    providerKey: "trackwise",
    displayName: "TrackWise",
    category: "QMS",
    capabilities: { supportsPolling: true, supportsApiAuth: true },
  },
  {
    providerKey: "sap_s4",
    displayName: "SAP S/4HANA",
    category: "ERP",
    capabilities: { supportsPolling: true, supportsApiAuth: true },
  },
  {
    providerKey: "generic_webhook",
    displayName: "Generic Webhook",
    category: "Generic",
    capabilities: { supportsWebhook: true, supportsApiAuth: true },
  },
  {
    providerKey: "sftp_drop",
    displayName: "SFTP Drop",
    category: "Generic",
    capabilities: { supportsSftp: true },
  },
  {
    providerKey: "csv_upload",
    displayName: "CSV Upload",
    category: "Generic",
    capabilities: { supportsCsv: true },
  },
  {
    providerKey: "demo_simulator",
    displayName: "Demo Simulator",
    category: "Generic",
    capabilities: { supportsPolling: true },
  },
];

const DEFAULT_MAPPING = {
  sourceToCanonicalMap: {
    id: "eventId",
    status: "status",
    severity: "severity",
    openedDate: "openedDate",
    dueDate: "dueDate",
    closedDate: "closedDate",
    repeatEvent: "repeatEvent",
  },
  transforms: [{ field: "severity", type: "enumMap", map: { critical: "Critical", major: "Major", minor: "Minor" } }],
  approvedBySupplier: true,
};

const main = async () => {
  ensureSafe();
  await connectDatabase();

  for (const provider of PROVIDERS) {
    await IntegrationProvider.findOneAndUpdate(
      { providerKey: provider.providerKey },
      { ...provider, isEnabled: true, mappingTemplates: [] },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const supplier = await User.findOne({ role: "supplier" });
  if (!supplier) {
    console.log("No supplier users found. Providers seeded only.");
    await mongoose.disconnect();
    return;
  }

  const connection = await IntegrationConnection.findOneAndUpdate(
    { supplierId: supplier._id, providerKey: "demo_simulator" },
    {
      tenantId: supplier.tenant_id || null,
      supplierId: supplier._id,
      providerKey: "demo_simulator",
      name: "Demo Simulator Feed",
      status: "Active",
      demoMode: true,
      selectedFeeds: [
        { eventType: "CAPA", enabled: true },
        { eventType: "DEVIATION", enabled: true },
      ],
      syncMode: "DELTA",
      schedule: { frequencyMins: 240, timezone: "America/Chicago", nextRunAt: new Date() },
      visibilityPolicy: { shareLevel: "AGGREGATED_ONLY", retentionDays: 365 },
      createdBy: supplier._id,
      updatedBy: supplier._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const mappingPayload = {
    tenantId: supplier.tenant_id || null,
    connectionId: connection._id,
    version: 1,
    ...DEFAULT_MAPPING,
  };

  await IntegrationMappingConfig.findOneAndUpdate(
    { tenantId: supplier.tenant_id || null, connectionId: connection._id, eventType: "CAPA" },
    { ...mappingPayload, eventType: "CAPA" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await IntegrationMappingConfig.findOneAndUpdate(
    { tenantId: supplier.tenant_id || null, connectionId: connection._id, eventType: "DEVIATION" },
    { ...mappingPayload, eventType: "DEVIATION" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("Seeded Integration providers and demo connection.");
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error("seed-integrations-demo failed", err);
  process.exit(1);
});
