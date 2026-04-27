import "./config/loadEnv.js";
import express from "express";
import path from "path";
import { connectDatabase } from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import supplierSiteRoutes from "./routes/supplierSiteRoutes.js";
import supplierProfileRoutes from "./routes/supplierProfileRoutes.js";
import supplierProfileUserRoutes from "./routes/supplierUserProfileRoutes.js";
import supplierProductRoutes from "./routes/supplierProductRoutes.js";
import vendorRegistrationRoutes from "./routes/vendorRegistrationRoutes.js";
import buyerRoutes from "./routes/buyerRoutes.js";
import auditRequestRoutes from "./routes/auditRequestRoutes.js";
import auditorRoutes from "./routes/auditorRoutes.js";
import commonRoutes from "./routes/commonRoutes.js";
import questionaireRoutes from "./routes/questionaireRoutes.js";
import questionnaireUploadRoutes from "./routes/questionnaireUploadRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import reportTemplateRoutes from "./routes/reportTemplateRoutes.js";
import reportInstanceRoutes from "./routes/reportInstanceRoutes.js";
import formLayoutRoutes from "./routes/formLayoutRoutes.js";
import fdaRoutes from "./routes/fdaRoutes.js";
import platformRoutes from "./routes/platformRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import cors from "cors";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import notificationModuleRoutes from "./modules/notifications/routes/index.js";
import notificationAdminDebugRoutes from "./modules/notifications/routes/adminDebugRoutes.js";
import { startNotificationSchedulers } from "./modules/notifications/services/scheduler.js";
import workflowMilestoneRoutes from "./routes/workflowMilestoneRoutes.js";
import evidenceRoutes from "./routes/evidenceRoutes.js";
import auditNoteRoutes from "./routes/auditNoteRoutes.js";
import capaRoutes from "./routes/capaRoutes.js";
import askHawkRoutes from "./routes/askHawkRoutes.js";
import aiPrefillRoutes from "./routes/aiPrefillRoutes.js";
import aiFeaturesRoutes from "./routes/aiFeaturesRoutes.js";
import aiWave2Routes from "./routes/aiWave2Routes.js";
import aiWave3Routes from "./routes/aiWave3Routes.js";
import auditAgentsRoutes from "./routes/auditAgentsRoutes.js";
import aiGapAgentsRoutes from "./routes/aiGapAgentsRoutes.js";
import adminAiRoutes from "./routes/adminAiRoutes.js";
import orgAdminRoutes from "./routes/orgAdminRoutes.js";
import supplierQualityEventsRoutes from "./routes/supplierQualityEventsRoutes.js";
import adminTenantRoutes from "./routes/adminTenantRoutes.js";
import auditorNetworkRoutes from "./routes/auditorNetworkRoutes.js";
import devRoutes from "./routes/devRoutes.js";
import publicIntelRoutes from "./routes/publicIntelRoutes.js";
import docIntelRoutes from "./routes/docIntelRoutes.js";
import rfqRoutes from "./routes/rfqRoutes.js";
import apiMasterRoutes from "./routes/apiMasterRoutes.js";
import productSiteMappingRoutes from "./routes/productSiteMappingRoutes.js";
import documentDisclosureRoutes from "./routes/documentDisclosureRoutes.js";
import { startPublicIntelScheduler } from "./services/publicIntel/scheduler/index.js";
import { seedDev } from "./controllers/devController.js";
import adminGovernanceRoutes from "./routes/v1/adminGovernanceRoutes.js";
import userGovernanceRoutes from "./routes/v1/userGovernanceRoutes.js";
import { seedGovernanceIfEnabled } from "./services/governance/seedGovernance.js";
import tableVariantRoutes from "./routes/tableVariantRoutes.js";
import e2eSeedRoutes from "./routes/e2eSeedRoutes.js";
import auditScheduleRoutes from "./routes/auditScheduleRoutes.js";
import buyerRiskRoutes from "./routes/buyerRiskRoutes.js";
import supplierRiskRoutes from "./routes/supplierRiskRoutes.js";
import adminRiskRoutes from "./routes/adminRiskRoutes.js";
import { startRiskScheduler } from "./jobs/riskCron.js";
import questionnaireAssignmentRoutes from "./routes/questionnaireAssignmentRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";
import { startIntegrationScheduler } from "./integrations/services/schedulerService.js";
import digilockerRoutes from "./routes/digilockerRoutes.js";
import auditPhaseRoutes from "./routes/auditPhaseRoutes.js";
import auditTrailRoutes from "./routes/auditTrailRoutes.js";
import auditEventRoutes from "./routes/auditEventRoutes.js";
import preAuditRoutes from "./routes/preAuditRoutes.js";
import remoteAuditRoutes from "./routes/remoteAuditRoutes.js";
import monitoringRoutes from "./routes/monitoringRoutes.js";
import assessmentTypeRoutes from "./routes/assessmentTypeRoutes.js";
import statusDefinitionRoutes from "./routes/statusDefinitionRoutes.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import v2Routes from "./routes/v2/index.js";
import systemSettingsRoutes from "./routes/systemSettingsRoutes.js";
import complianceStandardsRoutes from "./routes/complianceStandardsRoutes.js";
import complianceRunRoutes from "./routes/complianceRunRoutes.js";
import userCalendarRoutes from "./routes/userCalendarRoutes.js";
import eqmsIntelRoutes from "./routes/eqmsIntelRoutes.js";
import capaV2Routes from "./routes/capaV2Routes.js";
import orgDirectoryRoutes from "./routes/orgDirectoryRoutes.js";
import engagementRoutes from "./routes/engagementRoutes.js";
import orgCatalogRoutes from "./routes/orgCatalogRoutes.js";
import qualificationCaseRoutes from "./routes/qualificationCaseRoutes.js";
import marketplaceCatalogRoutes from "./routes/marketplaceCatalogRoutes.js";
import universalModuleConfigRoutes from "./routes/universalModuleConfigRoutes.js";
import universalWorkflowDefinitionRoutes from "./routes/universalWorkflowDefinitionRoutes.js";
import partyRoutes from "./routes/partyRoutes.js";
import changeControlRoutes from "./routes/changeControlRoutes.js";
import workflowEventRoutes from "./routes/workflowEventRoutes.js";
import workflowSubjectRoutes from "./routes/workflowSubjectRoutes.js";
import transactionReviewRoutes from "./routes/transactionReviewRoutes.js";
// ── Phase 0 + Phase 1 EQMS routes ────────────────────────────────────────────
import supplierPreQualificationRoutes from "./routes/supplierPreQualificationRoutes.js";
import documentControlRoutes from "./routes/documentControlRoutes.js";
import riskItemRoutes from "./routes/riskItemRoutes.js";
import trainingRecordRoutes from "./routes/trainingRecordRoutes.js";
import managementReviewRoutes from "./routes/managementReviewRoutes.js";
import complaintRoutes from "./routes/complaintRoutes.js";
import equipmentRoutes from "./routes/equipmentRoutes.js";
import deviationRoutes from "./routes/deviationRoutes.js";
import electronicSignatureRoutes from "./routes/electronicSignatureRoutes.js";
import crossModuleRoutes from "./routes/crossModuleRoutes.js";
import auditorQualificationRoutes from "./routes/auditorQualificationRoutes.js";
import batchRecordRoutes from "./routes/batchRecordRoutes.js";
import designControlRoutes from "./routes/designControlRoutes.js";
const app = express();

const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.SERVERLESS === "true"
);

let runtimeInitPromise = null;
let runtimeInitialized = false;
let runtimeInitError = null;

const initializeRuntime = async () => {
  if (runtimeInitialized) return true;

  if (!runtimeInitPromise) {
    runtimeInitPromise = (async () => {
      await connectDatabase();
      await seedGovernanceIfEnabled();

      if (!isServerlessRuntime) {
        startNotificationSchedulers();
        startPublicIntelScheduler();
        startRiskScheduler();
        startIntegrationScheduler();
      }

      runtimeInitialized = true;
      runtimeInitError = null;
      return true;
    })().catch((error) => {
      runtimeInitError = error;
      runtimeInitPromise = null;
      throw error;
    });
  }

  return runtimeInitPromise;
};

// Middleware
const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }
  return jsonParser(req, res, next);
});
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
// EXTRA_ORIGINS: comma-separated list of additional allowed origins (e.g. Vercel preview URLs)
const extraOrigins = process.env.EXTRA_ORIGINS
  ? process.env.EXTRA_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: [
    /^http:\/\/localhost:3000$/,
    /^http:\/\/localhost:3001$/,
    /^https?:\/\/([a-z0-9-]+\.)?hawkeyesmart\.com$/,
    /^https:\/\/[a-z0-9-]+(\.vercel\.app)$/,
    ...extraOrigins,
  ],
  credentials: true,
}));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/health", (_req, res) => {
  if (runtimeInitError) {
    return res.status(503).json({
      ok: false,
      initialized: runtimeInitialized,
      error: runtimeInitError.message || "Runtime initialization failed",
    });
  }

  return res.status(200).json({
    ok: true,
    initialized: runtimeInitialized,
    runtime: isServerlessRuntime ? "serverless" : "server",
  });
});

app.use(async (_req, res, next) => {
  try {
    await initializeRuntime();
    return next();
  } catch (error) {
    console.error("Runtime init failed:", error.message);
    return res.status(503).json({
      error: "Backend startup failed",
      details: error.message || "Initialization error",
    });
  }
});

app.use("/api/auth", authRoutes);
// Dev-only seed shortcut (bypass any auth intercepts)
app.post("/api/dev-seed", seedDev);
app.use("/api", devRoutes);
app.use("/api", e2eSeedRoutes);
app.use("/api/supplier-sites", supplierSiteRoutes);
app.use("/api/profile", supplierProfileRoutes);
app.use("/api/supplier-products", supplierProductRoutes);
app.use("/api/profile/supplier-user", supplierProfileUserRoutes);
app.use("/api/onboarding", vendorRegistrationRoutes);
app.use("/api/buyer", buyerRiskRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/auditor", auditorRoutes);
app.use("/api/audit-requests/", auditRequestRoutes);
app.use("/api", userCalendarRoutes);
app.use("/api", commonRoutes);
app.use("/api/template-questions", questionaireRoutes);
app.use("/api", notificationModuleRoutes);
app.use("/api/questionnaires", questionnaireUploadRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/report-templates", reportTemplateRoutes);
app.use("/api", reportInstanceRoutes);
app.use("/api/form-layouts", formLayoutRoutes);
app.use("/api", fdaRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminRiskRoutes);
app.use("/api", dashboardRoutes);
app.use("/api/platform/notifications-debug", notificationAdminDebugRoutes);
app.use("/api/workflow-milestones", workflowMilestoneRoutes);
app.use("/api", evidenceRoutes);
app.use("/api", auditNoteRoutes);
app.use("/api/capas", capaRoutes);
app.use("/api", askHawkRoutes);
app.use("/api/ai", aiFeaturesRoutes);
app.use("/api/ai", aiWave2Routes);
app.use("/api/ai", aiWave3Routes);
app.use("/api/ai/audit-agents", auditAgentsRoutes);
app.use("/api/ai", aiGapAgentsRoutes);
app.use("/api/admin/ai", adminAiRoutes);
app.use("/api/internal-admin", orgAdminRoutes);
app.use("/api/suppliers", supplierQualityEventsRoutes);

// Register Wave-2 agent tools at boot so the agent has something to plan with.
// Defer model lookups until first request so all models have time to load.
import("./services/ai/wave2/toolCallingRuntime.js")
  .then(async ({ registerCoreTools }) => {
    try {
      const mongoose = (await import("mongoose")).default;
      const safeModel = (n) => { try { return mongoose.model(n); } catch { return null; } };
      const tools = registerCoreTools({
        AuditRequestMaster: safeModel("audit-requests-master"),
        Capa: safeModel("Capa") || safeModel("capas") || safeModel("Capas"),
        Deviation: safeModel("deviations") || safeModel("Deviation"),
      });
      if (tools.length) console.log(`[ai] registered ${tools.length} agent tools: ${tools.join(", ")}`);
    } catch (err) {
      console.warn("[ai] tool registration skipped:", err.message);
    }
  })
  .catch((err) => console.warn("[ai] tool registration import failed:", err.message));
app.use("/api/ai-prefill", aiPrefillRoutes);
app.use("/api", adminTenantRoutes);
app.use("/api", auditorNetworkRoutes);
app.use("/api", publicIntelRoutes);
app.use("/api", docIntelRoutes);
app.use("/api/rfqs", rfqRoutes);
app.use("/api/api-master", apiMasterRoutes);
app.use("/api/product-site-mappings", productSiteMappingRoutes);
app.use("/api", documentDisclosureRoutes);
app.use("/api/table-variants", tableVariantRoutes);
app.use("/api/v1/admin", adminGovernanceRoutes);
app.use("/api/v1/user", userGovernanceRoutes);
app.use("/api", auditScheduleRoutes);
app.use("/api/supplier", supplierRiskRoutes);
app.use("/api", questionnaireAssignmentRoutes);
app.use("/api", integrationRoutes);
app.use("/api", digilockerRoutes);
app.use("/api", auditPhaseRoutes);
app.use("/api", auditTrailRoutes);
app.use("/api", auditEventRoutes);
app.use("/api", preAuditRoutes);
app.use("/api", remoteAuditRoutes);
app.use("/api", monitoringRoutes);
app.use("/api/assessment-types", assessmentTypeRoutes);
app.use("/api/status-definitions", statusDefinitionRoutes);
app.use("/api", trackingRoutes);
app.use("/api", systemSettingsRoutes);
app.use("/api/v2", v2Routes);
app.use("/api/compliance/standards", complianceStandardsRoutes);
app.use("/api/auditor/compliance", complianceRunRoutes);
app.use("/api/eqms-intel", eqmsIntelRoutes);
app.use("/api/capa-v2", capaV2Routes);
app.use("/api/org-directory", orgDirectoryRoutes);
app.use("/api/engagements", engagementRoutes);
app.use("/api/org-catalog", orgCatalogRoutes);
app.use("/api/qualification-cases", qualificationCaseRoutes);
app.use("/api/marketplace-catalog", marketplaceCatalogRoutes);

// ── Universal Platform OS routes ──────────────────────────────────────────────
app.use("/api/universal/module-config", universalModuleConfigRoutes);
app.use("/api/universal/workflow-definitions", universalWorkflowDefinitionRoutes);
app.use("/api/universal/parties", partyRoutes);
app.use("/api/universal/change-controls", changeControlRoutes);
app.use("/api/universal/events", workflowEventRoutes);
app.use("/api/universal/workflow-subjects", workflowSubjectRoutes);
app.use("/api/universal/transactions", transactionReviewRoutes);
// ── Phase 0 + Phase 1 EQMS routes ────────────────────────────────────────────
app.use("/api/supplier-prequalifications", supplierPreQualificationRoutes);
app.use("/api/document-control", documentControlRoutes);
app.use("/api/risk-items", riskItemRoutes);
app.use("/api/training-records", trainingRecordRoutes);
app.use("/api/management-reviews", managementReviewRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/deviations", deviationRoutes);
// ── 21 CFR Part 11 + ALCOA+ ─────────────────────────────────────────────────
app.use("/api/signatures", electronicSignatureRoutes);
// ── Phase 1 cross-module intelligence + Phase 2 auditor qualifications ──────
app.use("/api/quality", crossModuleRoutes);
app.use("/api/auditor-qualifications", auditorQualificationRoutes);
// ── Phase 3 modules ─────────────────────────────────────────────────────────
app.use("/api/batch-records", batchRecordRoutes);
app.use("/api/design-controls", designControlRoutes);
// ─────────────────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.send("Server is Up");
});

if (!isServerlessRuntime) {
  initializeRuntime().catch((error) => {
    console.error("Runtime bootstrap failed:", error.message);
  });
}

export default app;


