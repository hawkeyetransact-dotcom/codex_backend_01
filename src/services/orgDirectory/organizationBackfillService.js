import crypto from "crypto";
import { AuditRequestMaster } from "../../models/auditRequestsMasterModel.js";
import { BuyerProfile } from "../../models/buyerProfileModel.js";
import { Engagement } from "../../models/engagementModels.js";
import { OrgClaim } from "../../models/orgClaimModel.js";
import { Organization } from "../../models/organizationModel.js";
import { OrganizationMigrationLog } from "../../models/organizationMigrationLogModel.js";
import { OrgSite } from "../../models/orgSiteModel.js";
import { SupplierProfile } from "../../models/supplierProfileModel.js";
import { SupplierSite } from "../../models/supplierSiteDataModel.js";
import Tenant from "../../models/tenantModel.js";
import { User } from "../../models/userModel.js";
import { buildDirectoryKey, normalizeOrgName, OrgResolutionService } from "./orgResolutionService.js";

const buildRunId = (scriptKey) => `${scriptKey}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

const findOrCreateOrganization = async ({ legalName, country = "", actorUserId = null, apply }) => {
  const normalizedLegalName = normalizeOrgName(legalName);
  if (!normalizedLegalName) return null;
  const existing = await Organization.findOne({
    normalizedLegalName,
    ...(country ? { "headquarters.country": country } : {}),
  });
  if (existing) return { organization: existing, created: false };
  if (!apply) return { organization: null, created: false };
  const organization = await Organization.create({
    directoryKey: buildDirectoryKey(legalName, country),
    legalName: legalName.trim(),
    normalizedLegalName,
    displayName: legalName.trim(),
    headquarters: { country },
    status: "ACTIVE",
    entityTypes: ["UNKNOWN"],
    legacyRefs: { source: "org-backfill" },
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  return { organization, created: true };
};

const withMigrationLog = async (scriptKey, { apply = false, tenantId = null }, runner) => {
  const runId = buildRunId(scriptKey);
  const log = await OrganizationMigrationLog.create({
    runId,
    scriptKey,
    mode: apply ? "COMMIT" : "DRY_RUN",
    status: "STARTED",
    tenantId: tenantId || null,
    counts: {},
    errorEntries: [],
  });

  try {
    const result = await runner({ runId });
    log.status = "COMPLETED";
    log.counts = result?.counts || {};
    log.errorEntries = result?.errors || [];
    log.completedAt = new Date();
    await log.save();
    return { runId, ...result };
  } catch (error) {
    log.status = "FAILED";
    log.completedAt = new Date();
    log.errorEntries = [{ message: error.message }];
    await log.save();
    throw error;
  }
};

export class OrganizationBackfillService {
  static async backfillOrganizations({ apply = false, tenantId = null } = {}) {
    return withMigrationLog("backfill-organizations", { apply, tenantId }, async () => {
      const tenantFilter = tenantId ? { _id: tenantId } : {};
      const tenants = await Tenant.find(tenantFilter).lean();
      const counts = { tenantsScanned: tenants.length, organizationsCreated: 0, claimsCreated: 0 };
      const errors = [];

      for (const tenant of tenants) {
        try {
          const buyerProfile = await BuyerProfile.findOne({ tenant_id: tenant._id }).lean();
          const supplierProfile = await SupplierProfile.findOne({ tenant_id: tenant._id }).lean();
          const legalName =
            buyerProfile?.companyName ||
            supplierProfile?.companyName ||
            tenant.displayName ||
            tenant.name;
          const country = buyerProfile?.country || supplierProfile?.country || "";
          const { organization, created } = await findOrCreateOrganization({ legalName, country, apply });
          if (!organization) continue;
          if (created) counts.organizationsCreated += 1;

          const existingClaim = await OrgClaim.findOne({ orgId: organization._id, tenantId: tenant._id }).lean();
          if (!existingClaim && apply) {
            await OrgClaim.create({
              orgId: organization._id,
              tenantId: tenant._id,
              claimType: "PRIMARY",
              status: "ACTIVE",
              confidence: 1,
              isPrimary: true,
            });
            counts.claimsCreated += 1;
          }
        } catch (error) {
          errors.push({ tenantId: String(tenant._id), message: error.message });
        }
      }

      return { counts, errors };
    });
  }

  static async backfillOrgSites({ apply = false, tenantId = null } = {}) {
    return withMigrationLog("backfill-org-sites", { apply, tenantId }, async () => {
      const query = tenantId ? { tenant_id: tenantId } : {};
      const sites = await SupplierSite.find(query).lean();
      const counts = { sitesScanned: sites.length, orgSitesCreated: 0, sitesSkipped: 0 };
      const errors = [];

      for (const site of sites) {
        try {
          const org = await OrgResolutionService.resolveSupplierOrg({ supplierUserId: site.user_id });
          if (!org?._id) {
            counts.sitesSkipped += 1;
            continue;
          }
          const siteKey = `legacy-site-${String(site._id)}`;
          const existing = await OrgSite.findOne({ siteKey }).lean();
          if (existing || !apply) continue;
          await OrgSite.create({
            siteKey,
            orgId: org._id,
            siteName: site.site_name || site.plant_id || "Supplier Site",
            normalizedSiteName: normalizeOrgName(site.site_name || site.plant_id || "Supplier Site"),
            siteType: "MANUFACTURING",
            address: {
              address1: site.address || "",
              city: site.city || "",
              state: site.state || "",
              postalCode: site.pinCode || "",
              country: site.country || "",
            },
            contactName: site.contactPersonName || "",
            contactEmail: site.email || "",
            contactPhone: site.phoneNumber || "",
            legacyRefs: { supplierSiteId: site._id, userId: site.user_id },
          });
          counts.orgSitesCreated += 1;
        } catch (error) {
          errors.push({ siteId: String(site._id), message: error.message });
        }
      }

      return { counts, errors };
    });
  }

  static async backfillEngagements({ apply = false, tenantId = null } = {}) {
    return withMigrationLog("backfill-engagements", { apply, tenantId }, async () => {
      const query = { ...(tenantId ? { tenantOrgId: String(tenantId) } : {}) };
      const audits = await AuditRequestMaster.find(query).select("tenantOrgId create_by_buyer_id supplier_id").lean();
      const counts = { auditsScanned: audits.length, engagementsCreated: 0 };
      const errors = [];

      for (const audit of audits) {
        try {
          const context = await OrgResolutionService.resolveAuditContext({
            tenantId: audit.tenantOrgId,
            buyerUserId: audit.create_by_buyer_id,
            supplierUserId: audit.supplier_id,
          });
          if (!context.buyerOrgId || !context.supplierOrgId) continue;

          const existing = await Engagement.findOne({
            ownerTenantId: audit.tenantOrgId,
            buyerOrgId: context.buyerOrgId,
            supplierOrgId: context.supplierOrgId,
          }).lean();
          if (existing || !apply) continue;

          await Engagement.create({
            engagementCode: `ENG-${Date.now()}-${String(audit._id).slice(-6)}`,
            ownerTenantId: audit.tenantOrgId,
            buyerOrgId: context.buyerOrgId,
            supplierOrgId: context.supplierOrgId,
            status: "ACTIVE",
            legacyRefs: { auditRequestId: audit._id },
          });
          counts.engagementsCreated += 1;
        } catch (error) {
          errors.push({ auditId: String(audit._id), message: error.message });
        }
      }

      return { counts, errors };
    });
  }

  static async linkAuditEngagements({ apply = false, tenantId = null } = {}) {
    return withMigrationLog("link-audit-engagements", { apply, tenantId }, async () => {
      const query = {
        ...(tenantId ? { tenantOrgId: String(tenantId) } : {}),
        $or: [{ engagementId: { $exists: false } }, { engagementId: null }],
      };
      const audits = await AuditRequestMaster.find(query).lean();
      const counts = { auditsScanned: audits.length, auditsLinked: 0 };
      const errors = [];

      for (const audit of audits) {
        try {
          const context = await OrgResolutionService.resolveAuditContext({
            tenantId: audit.tenantOrgId,
            buyerUserId: audit.create_by_buyer_id,
            supplierUserId: audit.supplier_id,
          });
          if (!context.engagementId || !apply) continue;
          await AuditRequestMaster.updateOne(
            { _id: audit._id },
            {
              $set: {
                buyerOrgId: context.buyerOrgId,
                supplierOrgId: context.supplierOrgId,
                engagementId: context.engagementId,
              },
            }
          );
          counts.auditsLinked += 1;
        } catch (error) {
          errors.push({ auditId: String(audit._id), message: error.message });
        }
      }

      return { counts, errors };
    });
  }
}
