import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/userModel.js";
import { SupplierSite } from "../src/models/supplierSiteDataModel.js";
import { Organization } from "../src/models/organizationModel.js";
import {
  CatalogProduct,
  ComplianceClaimRecordV2,
  ProductEvidenceLinkV2,
  SupplierProductClaimV2,
} from "../src/models/productCatalogV2Models.js";
import {
  createSupplierClaim,
  ensureCatalogProduct,
  resetMarketplaceV2Collections,
} from "../src/services/marketplaceCatalog/productCatalogService.js";

const isLocalUri = (uri) => /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(uri || "");

const ensureSafe = () => {
  if (process.env.USE_MEMORY_DB === "true") return;
  const mongoUri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI || "";
  if (process.env.MARKETPLACE_SEED_ALLOW === "true") return;
  if (!isLocalUri(mongoUri)) {
    console.error("Refusing to seed marketplace demo data on non-local database.");
    console.error("Set MARKETPLACE_SEED_ALLOW=true to override, or use a localhost Mongo URI.");
    process.exit(1);
  }
};

const PRODUCT_BLUEPRINTS = [
  {
    key: "losartan-api",
    payload: {
      listingType: "API",
      canonicalName: "Losartan Potassium",
      synonyms: ["Losartan K", "Losartan Potassium API"],
      description: "Angiotensin II receptor blocker API used in antihypertensive finished dosage products.",
      identifiers: { cas: "124750-99-8", inn: "losartan potassium" },
      quality: { specReference: "USP", assayPercent: { value: 98.5, comparator: ">=", unit: "%" } },
      stability: { retestPeriodMonths: 36, storageConditions: "Store below 25C in a dry place" },
      provenance: {
        sources: [
          { source_name: "fda_dmf_list", url: "https://www.fda.gov/drugs/drug-master-files-dmfs/drug-master-files-dmfs", confidence: 0.97 },
          { source_name: "edqm_cep_public", url: "https://www.edqm.eu/en/cep-database", confidence: 0.92 },
        ],
      },
      verificationStatus: "verified",
      sourcePriority: 1,
      refreshStrategy: "incremental",
    },
    claims: [
      {
        actorKey: "drreddy",
        supplierRole: ["manufacturer"],
        visibility: "public",
        complianceClaims: ["GMP", "USDMF", "COA", "SDS"],
        verifiedClaims: ["GMP", "USDMF"],
        evidenceDocTypes: ["GMP_CERT", "DMF_REFERENCE", "COA"],
        specReference: "USP",
        countryOfOrigin: "IN",
        moqValue: 25,
        moqUnit: "kg",
        siteCount: 2,
        verificationStatus: "verified",
      },
    ],
  },
  {
    key: "acetaminophen-api",
    payload: {
      listingType: "API",
      canonicalName: "Acetaminophen",
      synonyms: ["Paracetamol"],
      description: "Widely used analgesic and antipyretic API.",
      identifiers: { cas: "103-90-2", inn: "paracetamol" },
      quality: { specReference: "USP", assayPercent: { value: 99, comparator: ">=", unit: "%" } },
      stability: { retestPeriodMonths: 48, storageConditions: "Ambient storage" },
      provenance: {
        sources: [
          { source_name: "pharmacompass_public", url: "https://www.pharmacompass.com", confidence: 0.71 },
          { source_name: "pharmaoffer_public", url: "https://www.pharmaoffer.com", confidence: 0.69 },
        ],
      },
      verificationStatus: "review_required",
      sourcePriority: 2,
      refreshStrategy: "manual_review",
    },
    claims: [
      {
        actorKey: "drreddy",
        supplierRole: ["manufacturer", "distributor"],
        visibility: "registered",
        complianceClaims: ["GMP", "COA", "SDS"],
        verifiedClaims: ["GMP"],
        evidenceDocTypes: ["COA", "SDS"],
        specReference: "USP",
        countryOfOrigin: "IN",
        moqValue: 25,
        moqUnit: "kg",
        siteCount: 1,
        verificationStatus: "claimed",
      },
    ],
  },
  {
    key: "ibuprofen-tablets",
    payload: {
      listingType: "FDF",
      canonicalName: "Ibuprofen Tablets",
      description: "Finished dosage ibuprofen tablets for oral administration.",
      identifiers: { inn: "ibuprofen", productNdc: "55555-111-01" },
      fdf: { dosageForm: "TABLET", strength: { value: 200, unit: "mg" }, route: "ORAL" },
      quality: { specReference: "USP" },
      stability: { shelfLifeMonths: 24, storageConditions: "Store below 30C" },
      provenance: {
        sources: [
          { source_name: "openfda_ndc", url: "https://api.fda.gov/drug/ndc.json", confidence: 0.96 },
          { source_name: "pharmacompass_public", url: "https://www.pharmacompass.com", confidence: 0.68 },
        ],
      },
      verificationStatus: "verified",
      sourcePriority: 1,
      refreshStrategy: "incremental",
    },
    claims: [
      {
        actorKey: "cdmo1",
        supplierRole: ["cdmo", "packager"],
        visibility: "public",
        complianceClaims: ["GMP", "COA", "AuditReport"],
        verifiedClaims: ["GMP"],
        evidenceDocTypes: ["AUDIT_REPORT", "COA"],
        specReference: "USP",
        countryOfOrigin: "IN",
        moqValue: 100000,
        moqUnit: "units",
        siteCount: 1,
        verificationStatus: "verified",
      },
      {
        actorKey: "drreddy",
        supplierRole: ["manufacturer", "distributor"],
        visibility: "registered",
        complianceClaims: ["COA"],
        verifiedClaims: [],
        evidenceDocTypes: ["COA"],
        specReference: "USP",
        countryOfOrigin: "IN",
        moqValue: 50000,
        moqUnit: "units",
        siteCount: 1,
        verificationStatus: "claimed",
      },
    ],
  },
  {
    key: "carton-component",
    payload: {
      listingType: "PACKAGING_COMPONENT",
      canonicalName: "Printed Carton Component",
      synonyms: ["Printed Carton", "Carton Packaging"],
      description: "Secondary packaging carton component with serialized artwork control.",
      identifiers: { hsCode: "481920" },
      provenance: {
        sources: [
          { source_name: "cphi_online_public", url: "https://www.cphi-online.com", confidence: 0.66 },
          { source_name: "pharmaoffer_public", url: "https://www.pharmaoffer.com", confidence: 0.61 },
        ],
      },
      verificationStatus: "review_required",
      sourcePriority: 2,
      refreshStrategy: "manual_review",
    },
    claims: [
      {
        actorKey: "cdmo2",
        supplierRole: ["manufacturer", "packager"],
        visibility: "public",
        complianceClaims: ["ISO9001", "AuditReport"],
        verifiedClaims: ["ISO9001"],
        evidenceDocTypes: ["AUDIT_REPORT"],
        specReference: "In-house",
        countryOfOrigin: "IN",
        moqValue: 10000,
        moqUnit: "units",
        siteCount: 1,
        verificationStatus: "claimed",
      },
    ],
  },
];

const ACTORS = {
  drreddy: {
    email: "supplier1@test.com",
    orgName: "Dr Reddy's Laboratories",
  },
  cdmo1: {
    email: "cdmo1@test.com",
    orgName: "CDMO1",
  },
  cdmo2: {
    email: "cdmo2@test.com",
    orgName: "CDMO2",
  },
};

const loadActorContext = async (actorKey) => {
  const actorBlueprint = ACTORS[actorKey];
  if (!actorBlueprint) throw new Error(`Unknown actor key ${actorKey}`);

  const [user, organization] = await Promise.all([
    User.findOne({ email: actorBlueprint.email }).lean(),
    Organization.findOne({ legalName: actorBlueprint.orgName }).lean(),
  ]);

  if (!user) throw new Error(`User ${actorBlueprint.email} not found`);
  if (!organization) throw new Error(`Organization ${actorBlueprint.orgName} not found`);

  const sites = await SupplierSite.find({ user_id: user._id }).sort({ site_name: 1 }).lean();
  return { user, organization, sites };
};

const createSyntheticEvidence = async ({ claimId, tenantId, docTypes = [] }) => {
  for (const docType of docTypes) {
    await ProductEvidenceLinkV2.create({
      tenantId,
      claimId,
      docType,
      sha256: `synthetic-${claimId}-${docType}`.toLowerCase(),
      sourceUrl: `https://synthetic.hawkeye.local/${docType.toLowerCase()}.pdf`,
      verificationStatus: docType === "GMP_CERT" || docType === "DMF_REFERENCE" ? "verified" : "claimed",
    });
  }
};

const main = async () => {
  ensureSafe();
  await connectDatabase();
  console.log("Connected to DB");

  await resetMarketplaceV2Collections();

  const actorContext = {};
  for (const actorKey of Object.keys(ACTORS)) {
    actorContext[actorKey] = await loadActorContext(actorKey);
  }

  for (const blueprint of PRODUCT_BLUEPRINTS) {
    const { product } = await ensureCatalogProduct(blueprint.payload, {});
    await CatalogProduct.updateOne(
      { _id: product._id },
      {
        $set: {
          quality: blueprint.payload.quality || {},
          storage: blueprint.payload.stability || {},
          sourceSummary: (blueprint.payload.provenance?.sources || []).map((source) => ({
            sourceName: source.source_name,
            sourceUrl: source.url,
            confidenceScore: source.confidence,
            fetchedAtUtc: new Date(),
            claimOrigin: source.source_name?.includes("fda") || source.source_name?.includes("edqm") ? "registry_verification" : "public_source",
            verificationStatus: blueprint.payload.verificationStatus || "claimed",
          })),
          verificationStatus: blueprint.payload.verificationStatus || "review_required",
          verificationLastCheckedAt: new Date(),
          refreshStatus: "ready",
        },
      }
    );

    for (const claimBlueprint of blueprint.claims) {
      const actor = actorContext[claimBlueprint.actorKey];
      const siteIds = actor.sites.slice(0, claimBlueprint.siteCount).map((site) => site._id);

      const result = await createSupplierClaim(
        {
          catalogProductId: product._id,
          supplierName: actor.organization.displayName || actor.organization.legalName,
          supplierRole: claimBlueprint.supplierRole,
          siteIds,
          complianceClaims: claimBlueprint.complianceClaims,
          ownerOrgId: actor.organization._id,
          offer: {
            visibility: claimBlueprint.visibility,
            offerStatus: "active",
            quality: { specReference: claimBlueprint.specReference },
            supply: {
              moq: {
                value: claimBlueprint.moqValue,
                unit: claimBlueprint.moqUnit,
                isNegotiable: false,
              },
            },
            trade: { countryOfOrigin: claimBlueprint.countryOfOrigin },
          },
        },
        {
          tenantId: actor.user.tenant_id,
          userId: actor.user._id,
          ownerOrgId: actor.organization._id,
        }
      );

      await SupplierProductClaimV2.updateOne(
        { _id: result.claim._id },
        {
          $set: {
            claimStatus: "active",
            verificationStatus: claimBlueprint.verificationStatus,
            commercialReady: true,
          },
        }
      );

      if (claimBlueprint.verifiedClaims?.length) {
        await ComplianceClaimRecordV2.updateMany(
          { claimId: result.claim._id, claimType: { $in: claimBlueprint.verifiedClaims } },
          { $set: { verificationStatus: "verified", verifiedValue: true } }
        );
      }

      await createSyntheticEvidence({
        claimId: result.claim._id,
        tenantId: actor.user.tenant_id,
        docTypes: claimBlueprint.evidenceDocTypes,
      });
    }

    console.log(`Seeded ${blueprint.payload.canonicalName}`);
  }

  const summary = {
    products: await CatalogProduct.countDocuments(),
    claims: await SupplierProductClaimV2.countDocuments(),
    evidenceLinks: await ProductEvidenceLinkV2.countDocuments(),
  };
  console.log("Marketplace demo seed summary", summary);

  await mongoose.disconnect();
  console.log("Done.");
};

main().catch((error) => {
  console.error("seed-marketplace-demo failed", error);
  process.exit(1);
});
