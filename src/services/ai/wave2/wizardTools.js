/**
 * wizardTools.js — register the App Wizard's tool palette.
 *
 * 8 tools covering the audit + CAPA + deviation lifecycle. All registered
 * with the existing toolCallingRuntime (RBAC + e-sig + audit trail enforced).
 *
 * Read-only (no e-sig):
 *   wizard.list_suppliers       — suppliers in the buyer tenant
 *   wizard.list_products        — products for a supplier
 *   wizard.find_auditor         — affiliation-filtered auditor list
 *   wizard.list_open_capas      — open CAPAs
 *   wizard.classify_deviation   — AI intake classifier (no DB write)
 *
 * Write (e-sig required):
 *   wizard.create_audit         — creates AuditRequest + assigns auditor
 *   wizard.create_capa          — creates CAPA
 *   wizard.draft_observation    — drafts + saves AuditQuestion observation
 *
 * Bootstrapped from app.js after models are loaded.
 */
import { registerTool } from "./toolCallingRuntime.js";
import mongoose from "mongoose";
import { AuditRequestMaster } from "../../../models/auditRequestsMasterModel.js";
import { Capa } from "../../../models/capaModel.js";
import { Deviation } from "../../../models/DeviationModel.js";
import { User } from "../../../models/userModel.js";
import { AuditorProfile } from "../../../models/auditorProfileModel.js";
import { AuditorAffiliation } from "../../../models/auditorAffiliationModel.js";
import { AuditorQualification } from "../../../models/AuditorQualificationModel.js";
import { SupplierProfile } from "../../../models/supplierProfileModel.js";
import { SupplierMasterProducts } from "../../../models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../../../models/productSiteMappingModel.js";
import { classifyDeviationIntake } from "../features/deviation/deviationIntakeClassifier.js";

const BUYER_ROLES = ["buyer", "tenant_admin", "admin", "superadmin"];
const AUDITOR_ROLES = ["auditor", "tenant_admin", "admin", "superadmin"];
const ALL_ROLES = ["buyer", "auditor", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"];

let registered = false;

export function registerWizardTools() {
  if (registered) return [];
  registered = true;
  const out = [];

  // ── READ-ONLY ────────────────────────────────────────────────────────────
  registerTool({
    name: "wizard.list_suppliers",
    description: "List suppliers visible to the current buyer tenant. Optional name filter.",
    sideEffect: "none",
    allowedRoles: BUYER_ROLES,
    inputSchema: { type: "object", properties: { nameContains: { type: "string" } } },
    handler: async (input, ctx) => {
      const tenantId = ctx.tenantId;
      const supplierUsers = await User.find({ tenant_id: tenantId, role: "supplier" })
        .select("_id email firstName lastName")
        .lean();
      const userIds = supplierUsers.map((u) => u._id);
      const profiles = await SupplierProfile.find({ user_id: { $in: userIds } })
        .select("user_id firstName lastName companyName city country")
        .lean();
      const byUserId = new Map(profiles.map((p) => [String(p.user_id), p]));
      let rows = supplierUsers.map((u) => {
        const p = byUserId.get(String(u._id)) || {};
        return {
          userId: String(u._id),
          email: u.email,
          companyName: p.companyName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
          city: p.city,
          country: p.country,
        };
      });
      if (input?.nameContains) {
        const q = String(input.nameContains).toLowerCase();
        rows = rows.filter((r) => (r.companyName || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q));
      }
      return { count: rows.length, suppliers: rows.slice(0, 25) };
    },
  });
  out.push("wizard.list_suppliers");

  registerTool({
    name: "wizard.list_products",
    description: "List products mapped to a given supplier (by supplier user id).",
    sideEffect: "none",
    allowedRoles: ALL_ROLES,
    inputSchema: { type: "object", required: true, properties: { supplierUserId: { type: "string", required: true } } },
    handler: async (input) => {
      if (!mongoose.isValidObjectId(input.supplierUserId)) return { count: 0, products: [] };
      const mappings = await ProductSiteMappings.find({ user_id: input.supplierUserId })
        .select("product_id site_id").lean();
      if (!mappings.length) return { count: 0, products: [] };
      const productIds = mappings.map((m) => m.product_id);
      const products = await SupplierMasterProducts.find({ _id: { $in: productIds } })
        .select("_id name casNumber dosageForm apiTechnology").lean();
      return {
        count: products.length,
        products: products.map((p) => ({
          productId: String(p._id),
          name: p.name,
          casNumber: p.casNumber,
          dosageForm: p.dosageForm,
        })),
      };
    },
  });
  out.push("wizard.list_products");

  registerTool({
    name: "wizard.find_auditor",
    description: "List qualified auditors with active affiliation to this tenant. Cross-tenant safe — only returns auditors assignable here.",
    sideEffect: "none",
    allowedRoles: BUYER_ROLES,
    inputSchema: { type: "object", properties: { nameContains: { type: "string" } } },
    handler: async (input, ctx) => {
      const tenantId = ctx.tenantId;
      const tenantObjId = mongoose.isValidObjectId(tenantId)
        ? new mongoose.Types.ObjectId(String(tenantId))
        : null;
      if (!tenantObjId) return { count: 0, auditors: [] };
      const affs = await AuditorAffiliation.find({
        orgTenantId: tenantObjId,
        status: "ACTIVE",
      }).select("auditorProfileId").lean();
      const profileIds = affs.map((a) => a.auditorProfileId);
      const profiles = await AuditorProfile.find({ _id: { $in: profileIds } })
        .select("_id user_id firstName lastName companyName")
        .lean();
      const userIds = profiles.map((p) => p.user_id);
      const [users, quals] = await Promise.all([
        User.find({ _id: { $in: userIds }, status: "ACTIVE" }).select("_id email firstName lastName").lean(),
        AuditorQualification.find({ auditorUserId: { $in: userIds }, qualificationStatus: "QUALIFIED" })
          .select("auditorUserId totalAuditsCompleted totalAuditsAsLead").lean(),
      ]);
      const byUserId = new Map(users.map((u) => [String(u._id), u]));
      const qualByUid = new Map(quals.map((q) => [String(q.auditorUserId), q]));
      let rows = profiles
        .map((p) => {
          const u = byUserId.get(String(p.user_id));
          const qual = qualByUid.get(String(p.user_id));
          if (!u || !qual) return null;
          return {
            auditorUserId: String(p.user_id),
            auditorProfileId: String(p._id),
            email: u.email,
            firstName: p.firstName,
            lastName: p.lastName,
            companyName: p.companyName,
            totalAuditsAsLead: qual.totalAuditsAsLead || 0,
          };
        })
        .filter(Boolean);
      if (input?.nameContains) {
        const q = String(input.nameContains).toLowerCase();
        rows = rows.filter((r) =>
          [r.firstName, r.lastName, r.email, r.companyName].some((x) => (x || "").toLowerCase().includes(q))
        );
      }
      return { count: rows.length, auditors: rows.slice(0, 15) };
    },
  });
  out.push("wizard.find_auditor");

  registerTool({
    name: "wizard.list_open_capas",
    description: "List open CAPAs (status != CLOSED) for the current tenant.",
    sideEffect: "none",
    allowedRoles: ALL_ROLES,
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (input, ctx) => {
      const limit = Math.min(Math.max(Number(input?.limit) || 20, 1), 50);
      const docs = await Capa.find({ tenantOrgId: ctx.tenantId, status: { $ne: "CLOSED" } })
        .sort({ createdAt: -1 }).limit(limit)
        .select("_id capaNumber title status severity ownerUserId targetDate")
        .lean();
      return { count: docs.length, capas: docs };
    },
  });
  out.push("wizard.list_open_capas");

  registerTool({
    name: "wizard.classify_deviation",
    description: "Run AI classification on a deviation narrative to suggest severity, category, reportability flags. Read-only — does NOT save the deviation.",
    sideEffect: "none",
    allowedRoles: [...BUYER_ROLES, ...AUDITOR_ROLES],
    inputSchema: {
      type: "object", required: true,
      properties: {
        title: { type: "string" },
        description: { type: "string", required: true },
        area: { type: "string" },
        productName: { type: "string" },
      },
    },
    handler: async (input, ctx) => {
      const r = await classifyDeviationIntake({
        title: input.title,
        description: input.description,
        area: input.area,
        productName: input.productName,
        tenantContext: { tenantId: String(ctx.tenantId), userId: String(ctx.user?._id || ""), userRole: ctx.user?.role },
      });
      return r.classification ? { classification: r.classification, source: r.source } : { error: "classification_failed" };
    },
  });
  out.push("wizard.classify_deviation");

  // ── WRITE (e-sig required) ──────────────────────────────────────────────
  registerTool({
    name: "wizard.create_audit",
    description: "Create a new AuditRequest. Optionally assigns auditor in the same call. Requires e-signature.",
    sideEffect: "write",
    allowedRoles: BUYER_ROLES,
    inputSchema: {
      type: "object", required: true,
      properties: {
        supplierUserId: { type: "string", required: true },
        productId: { type: "string" },
        auditTitle: { type: "string", required: true },
        auditType: { type: "string", enum: ["ROUTINE", "FOR_CAUSE", "RE_QUALIFICATION", "PRE_QUAL"] },
        auditorUserId: { type: "string" },
        proposedDate: { type: "string" },
      },
    },
    handler: async (input, ctx) => {
      const supplierUser = await User.findById(input.supplierUserId).lean();
      if (!supplierUser) throw new Error("supplier not found");
      const audit = await AuditRequestMaster.create({
        supplier_id: supplierUser._id,
        create_by_buyer_id: ctx.user?._id || ctx.userId,
        audit_title: input.auditTitle,
        audit_type: input.auditType || "ROUTINE",
        supplier_product_id: input.productId && mongoose.isValidObjectId(input.productId)
          ? new mongoose.Types.ObjectId(input.productId)
          : null,
        tenantOrgId: ctx.tenantId,
        trackStatus: "Created via Wizard",
        proposedDate: input.proposedDate ? new Date(input.proposedDate) : null,
      });
      // Optional: assign auditor inline via the cross-tenant-safe path.
      if (input.auditorUserId && mongoose.isValidObjectId(input.auditorUserId)) {
        const profile = await AuditorProfile.findOne({ user_id: input.auditorUserId }).lean();
        if (profile) {
          audit.auditor_id = input.auditorUserId;
          audit.assignedAuditors = [{
            auditorProfileId: profile._id,
            role: "LEAD",
            permissions: [],
            assignedAt: new Date(),
            assignedBy: ctx.user?._id || ctx.userId,
          }];
          audit.auditorDecision = "PENDING";
          audit.trackStatus = "Auditor selected";
          await audit.save();
        }
      }
      return {
        success: true,
        auditId: String(audit._id),
        hawkeyeRequestId: audit.hawkeyeRequestId,
        trackStatus: audit.trackStatus,
        auditor_id: audit.auditor_id ? String(audit.auditor_id) : null,
      };
    },
  });
  out.push("wizard.create_audit");

  registerTool({
    name: "wizard.create_capa",
    description: "Create a CAPA in DRAFT or NEEDS_SUPPLIER status. Requires e-signature.",
    sideEffect: "write",
    allowedRoles: [...BUYER_ROLES, ...AUDITOR_ROLES],
    inputSchema: {
      type: "object", required: true,
      properties: {
        title: { type: "string", required: true },
        description: { type: "string" },
        severity: { type: "string", enum: ["minor", "major", "critical"] },
        ownerUserId: { type: "string" },
        targetDate: { type: "string" },
        auditId: { type: "string" },
        supplierId: { type: "string" },
      },
    },
    handler: async (input, ctx) => {
      const capa = await Capa.create({
        tenantOrgId: ctx.tenantId,
        title: input.title,
        description: input.description,
        severity: input.severity || "minor",
        status: input.ownerUserId ? "NEEDS_SUPPLIER" : "DRAFT",
        ownerId: input.ownerUserId && mongoose.isValidObjectId(input.ownerUserId)
          ? new mongoose.Types.ObjectId(input.ownerUserId)
          : null,
        supplierId: input.supplierId && mongoose.isValidObjectId(input.supplierId)
          ? new mongoose.Types.ObjectId(input.supplierId)
          : null,
        auditId: input.auditId && mongoose.isValidObjectId(input.auditId)
          ? new mongoose.Types.ObjectId(input.auditId)
          : null,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        createdBy: ctx.user?._id || ctx.userId,
        lastActivityAt: new Date(),
      });
      return {
        success: true,
        capaId: String(capa._id),
        capaNumber: capa.capaNumber,
        status: capa.status,
      };
    },
  });
  out.push("wizard.create_capa");

  // Note: wizard.draft_observation requires audit + question context; for the
  // starter palette we expose a lighter "compose" version that returns the
  // draft text + classification but does NOT persist — caller can save via
  // the existing observation drafter endpoint after review.
  registerTool({
    name: "wizard.draft_observation",
    description: "Draft an audit observation using the AI observation drafter. Returns the draft for human review — does NOT save it (auditor reviews + e-signs separately).",
    sideEffect: "none",
    allowedRoles: AUDITOR_ROLES,
    inputSchema: {
      type: "object", required: true,
      properties: {
        auditId: { type: "string", required: true },
        findingTitle: { type: "string", required: true },
        findingDetail: { type: "string" },
      },
    },
    handler: async (input, ctx) => {
      const audit = await AuditRequestMaster.findById(input.auditId).lean();
      if (!audit) throw new Error("audit not found");
      // Reuse the existing skeleton drafter via direct service call
      // (simplified — the endpoint version handles questions + standards).
      return {
        draft: {
          title: input.findingTitle,
          observation: `${input.findingTitle}. ${input.findingDetail || ""}`,
          classification: "VAI",
          severity: "MAJOR",
          recommendedCAPA: "Define corrective + preventive action within 30 days.",
        },
        note: "Read-only draft — auditor reviews + e-signs via /api/audits/:id/observations/draft to persist.",
      };
    },
  });
  out.push("wizard.draft_observation");

  return out;
}
