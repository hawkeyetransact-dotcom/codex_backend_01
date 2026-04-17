# HawkEye Platform — Technical Architecture Document

**Version:** 1.0  
**Date:** 2026-04-12  
**Scope:** Complete system architecture as implemented across `codex_backend_01` and `codex_frontend_01`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Deployment Topology](#3-deployment-topology)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Data Architecture](#6-data-architecture)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Audit Workflow Engine](#8-audit-workflow-engine)
9. [AI & Intelligence Layer](#9-ai--intelligence-layer)
10. [Module System](#10-module-system)
11. [Integration Architecture](#11-integration-architecture)
12. [Notification System](#12-notification-system)
13. [API Surface](#13-api-surface)
14. [Codebase Metrics](#14-codebase-metrics)

---

## 1. System Overview

HawkEye is a **multi-tenant, role-based supply chain audit and quality management platform** that connects buyers, suppliers, and auditors through a structured workflow engine. The platform spans supplier qualification, audit lifecycle management, CAPA tracking, risk scoring, compliance monitoring, and document management.

```
 ACTORS                    PLATFORM                      EXTERNAL
 ======                    ========                      ========

 +----------+      +---------------------------+     +-----------+
 |  Buyer   |----->|                           |---->| FDA Data  |
 +----------+      |     HawkEye Platform      |     +-----------+
                   |                           |
 +----------+      |  Audit | EQMS | Risk |    |     +-----------+
 | Supplier |----->|  CAPA  | Docs | Intel |   |---->| LLM (AI)  |
 +----------+      |                           |     +-----------+
                   |  Workflow Engine           |
 +----------+      |  Template System           |     +-----------+
 | Auditor  |----->|  Notification Hub          |---->| AWS S3    |
 +----------+      |  Trust Graph               |     +-----------+
                   |                           |
 +----------+      |                           |     +-----------+
 |  Admin   |----->|                           |---->| Email/SES |
 +----------+      +---------------------------+     +-----------+
```

**Key actors:**
- **Buyer** — initiates audit requests, assigns auditors, tracks supplier compliance
- **Supplier** — responds to audits, submits questionnaires, provides evidence
- **Auditor** — conducts audits, reviews responses, issues findings/reports
- **Tenant Admin** — manages organization settings, users, modules
- **Platform Admin** — manages the entire platform, tenants, governance

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Next.js 15 (App Router)                          │    │
│  │                                                                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │    │
│  │  │  Auth    │ │  Audit   │ │ Supplier │ │ Reports  │ │  Admin   │ │    │
│  │  │  Pages   │ │  Pages   │ │  Pages   │ │  Pages   │ │  Pages   │ │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │    │
│  │       │             │            │             │            │       │    │
│  │  ┌────┴─────────────┴────────────┴─────────────┴────────────┴────┐ │    │
│  │  │              Server Actions + Axios Instance                   │ │    │
│  │  │          (JWT cookie, auto-attach Authorization header)        │ │    │
│  │  └────────────────────────────┬───────────────────────────────────┘ │    │
│  │                               │                                     │    │
│  │  ┌────────────────────────────┴───────────────────────────────────┐ │    │
│  │  │         Next.js API Routes (/api/next/*)  [proxy layer]        │ │    │
│  │  └────────────────────────────┬───────────────────────────────────┘ │    │
│  └───────────────────────────────┼─────────────────────────────────────┘    │
│                                  │ HTTPS                                    │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────┐
│                           API LAYER                                         │
│                                  │                                          │
│  ┌───────────────────────────────┴──────────────────────────────────────┐   │
│  │                    Express.js (Node.js 20)                           │   │
│  │                                                                      │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐    │   │
│  │  │  CORS  │ │  Auth  │ │ Tenant │ │  Role  │ │ Feature Flags  │    │   │
│  │  │Midware │→│Midware │→│Midware │→│Midware │→│   Middleware   │    │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────────────┘    │   │
│  │       │                                                              │   │
│  │  ┌────┴──────────────────────────────────────────────────────────┐   │   │
│  │  │                    78 Route Mount Points                       │   │   │
│  │  │                    74 Controllers                              │   │   │
│  │  │                    80+ Services                                │   │   │
│  │  └───────────────────────────┬───────────────────────────────────┘   │   │
│  └──────────────────────────────┼──────────────────────────────────────┘    │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────────────────┐
│                          DATA LAYER                                         │
│                                 │                                           │
│   ┌──────────────┐  ┌──────────┴──────┐  ┌──────────┐  ┌──────────────┐   │
│   │  MongoDB 7   │  │   154 Models    │  │  AWS S3  │  │  In-Memory   │   │
│   │  (Atlas)     │  │  196 Collections│  │  (Files) │  │  (Test/Dev)  │   │
│   └──────────────┘  └─────────────────┘  └──────────┘  └──────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deployment Topology

```
                    ┌──────────────────────────────────────┐
                    │           GitHub Repositories         │
                    │                                      │
                    │  codex_frontend_01   codex_backend_01│
                    │     (Next.js)           (Express)    │
                    └──────────┬───────────────┬───────────┘
                               │               │
              ┌────────────────┤               ├────────────────┐
              │                │               │                │
     push to main       push to main     push to dev      push to dev
              │                │               │                │
              v                v               v                v
   ┌──────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  Vercel          │ │  Vercel      │ │ AWS Elastic  │ │ AWS Elastic  │
   │  Frontend (Prod) │ │  Backend     │ │ Beanstalk    │ │ Beanstalk    │
   │                  │ │  (Serverless)│ │ (Dev)        │ │ (Prod)       │
   │  hawkeye-        │ │  hawkeye-    │ │              │ │              │
   │  frontend-dev    │ │  backend-dev │ │              │ │              │
   │  -chi.vercel.app │ │  .vercel.app │ │              │ │              │
   └──────────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
              │                │                    │              │
              └────────────────┴────────────┬───────┴──────────────┘
                                            │
                                            v
                              ┌─────────────────────────┐
                              │   MongoDB Atlas          │
                              │   Cluster: hawkeye-dev   │
                              │                          │
                              │  ┌─────────────────────┐ │
                              │  │  DB: hawkeye         │ │
                              │  │  196 collections     │ │
                              │  │  154 models          │ │
                              │  └─────────────────────┘ │
                              │  ┌─────────────────────┐ │
                              │  │  DB: hawkeye_        │ │
                              │  │  universal_dev       │ │
                              │  │  (empty — future)    │ │
                              │  └─────────────────────┘ │
                              └─────────────────────────┘

  Vercel Projects (Hobby Plan):
  ┌────────────────────────────────────────────────────────────┐
  │  hawkeye-frontend-dev  │  prj_Ao0QJGO11bWWtlhuEvhR5114   │
  │  hawkeye-backend-dev   │  prj_pWdvLE1YzpAh4BPB2Fsye3jZ   │
  │  Owner: team_agtnHRcySXyN9EYzdAxAo4sk                     │
  │  Git Author: hawkeyetransact@gmail.com (required)          │
  └────────────────────────────────────────────────────────────┘
```

**CI/CD Pipeline (Backend):**
```
  push to dev/main
        │
        v
  GitHub Actions (.github/workflows/deploy.yml)
        │
        ├─ npm ci
        ├─ npm run quality:askhawk (threshold: 0.85)
        ├─ Configure AWS CLI
        ├─ Initialize EB CLI
        └─ eb deploy $DEPLOY_ENV --staged
              │
              ├─ dev branch  → EB_ENV_DEV
              └─ main branch → EB_ENV_PROD
```

---

## 4. Backend Architecture

### 4.1 Express Application Structure

```
src/
├── app.js                       # Express app, middleware chain, route mounting
├── server.js                    # HTTP server entry point
│
├── config/                      # Configuration
│   ├── database.js              #   MongoDB connection (Atlas / MemoryDB)
│   ├── loadEnv.js               #   dotenv loader
│   ├── sesTransporter.js        #   AWS SES email config
│   ├── swagger.js               #   OpenAPI docs generator
│   ├── featureFlags.js          #   Feature flag definitions
│   └── polyfills.cjs            #   Node.js polyfills
│
├── constants/                   # Domain constants
│   ├── auditPhases.js           #   8 phases, statuses, artifact types
│   └── assessmentTracking.js    #   Phase keys, template types, tracking
│
├── middlewares/                  # Request pipeline
│   ├── authMiddleware.js        #   JWT verification + user hydration
│   ├── roleMiddleware.js        #   permit(role1, role2, ...) RBAC
│   ├── tenantMiddleware.js      #   Multi-tenant scoping
│   ├── featureFlagMiddleware.js #   Feature gate evaluation
│   ├── moduleEntitlementMiddleware.js  # Tenant module access
│   ├── uploadMiddleware.js      #   Multer file upload config
│   ├── validate.js              #   Joi schema validation
│   ├── askHawkEnabledMiddleware.js     # AskHawk feature gate
│   └── authorizeAskHawk.js     #   AskHawk authorization
│
├── controllers/                 # 74 request handlers
│   ├── auditPhaseController.js  #   2,748 lines — phase state machine
│   ├── buyerController.js       #   1,563 lines — buyer operations
│   ├── auditRequestController.js#   1,059 lines — audit CRUD + visibility
│   ├── authController.js        #     769 lines — login, register, reset
│   ├── capaV2Controller.js      #   1,358 lines — CAPA lifecycle
│   ├── autoFillController.js    #   1,995 lines — LLM-driven autofill
│   └── ... (68 more)
│
├── models/                      # 154 Mongoose schemas
│   ├── userModel.js             #   User (email, role, tenant_id, ...)
│   ├── tenantModel.js           #   Tenant (name, type, status, ...)
│   ├── auditRequestsMasterModel.js # Audit master record (50+ fields)
│   ├── auditArtifactModel.js    #   Phase deliverables
│   ├── capaV2Models.js          #   15 CAPA sub-models
│   └── ... (149 more)
│
├── services/                    # 80+ business logic files
│   ├── auditPhaseService.js     #   Phase state derivation + transitions
│   ├── auditWorkflowSyncService.js # Milestone sync + tenant scope
│   ├── risk/                    #   11 files — risk scoring engine
│   ├── publicIntel/             #   FDA data sync + connectors
│   ├── governance/              #   Notification governance + seeding
│   ├── compliance/              #   Compliance standard matching
│   ├── eqms/                    #   6 EQMS domain services
│   └── ... (60+ more)
│
├── modules/                     # Self-contained feature modules
│   ├── auditEngine/             #   Phase rules, assessment builder
│   ├── capaV2/                  #   CAPA status machine, constants
│   ├── compliance/              #   Default standards, constants
│   └── notifications/           #   Full module (see Section 12)
│
├── routes/                      # 60+ route files → 78 mount points
│   ├── v1/                      #   Governance routes
│   └── v2/                      #   Assessment + questionnaire routes
│
├── jobs/                        # Scheduled work
│   ├── riskCron.js              #   Daily risk recalculation (2:30 AM)
│   └── riskQueue.js             #   Batch risk processing queue
│
├── integrations/                # Third-party integrations
│   ├── providers/               #   CSV, webhook, demo, stub providers
│   └── services/                #   Scheduler, sync services
│
├── validators/                  # Joi validation schemas
│   ├── authValidator.js         #   Login, register, password reset
│   └── ...
│
└── utils/                       # Utilities
    ├── templateDefaults.js      #   Template auto-resolution logic
    ├── templateLifecycle.js     #   Template type ↔ artifact mapping
    └── ...
```

### 4.2 Middleware Pipeline

```
  Request
    │
    v
 ┌──────────────────┐
 │    CORS           │  Origins: localhost, hawkeyesmart.com, *.vercel.app
 └────────┬─────────┘
          v
 ┌──────────────────┐
 │   JSON Parser    │  Skipped for GET/HEAD requests (perf optimization)
 └────────┬─────────┘
          v
 ┌──────────────────┐
 │  Health Check    │  /health — returns init state, bypasses auth
 └────────┬─────────┘
          v
 ┌──────────────────┐
 │  Runtime Init    │  Lazy DB connect + governance seed (once per cold start)
 └────────┬─────────┘
          v
 ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
 │   authenticate   │────>│   permit(roles)  │────>│   Controller     │
 │   (JWT verify)   │     │   (RBAC check)   │     │   (handler fn)   │
 └──────────────────┘     └──────────────────┘     └──────────────────┘
```

### 4.3 Serverless Adaptation

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  api/index.js (Vercel entry)                 │
  │                                                              │
  │   import app from "../src/app.js";                           │
  │   export default app;                                        │
  │                                                              │
  │   Detection: process.env.VERCEL || AWS_LAMBDA_FUNCTION_NAME  │
  │                                                              │
  │   When isServerlessRuntime = true:                           │
  │     - Skip scheduler startup                                 │
  │     - Lazy-init DB on first request                          │
  │     - maxDuration: 60s (vercel.json)                         │
  │     - .vercelignore excludes 20+ directories                 │
  │     - Keeps test/data/ for pdf-parse workaround              │
  │                                                              │
  │   When isServerlessRuntime = false (EB / local):             │
  │     - Eager DB connect on boot                               │
  │     - Start: notification, risk, publicIntel, integration    │
  │       schedulers                                             │
  └─────────────────────────────────────────────────────────────┘
```

---

## 5. Frontend Architecture

### 5.1 Next.js App Router Structure

```
app/
├── layout.tsx                   # Root layout: providers, theme, i18n
├── page.tsx                     # Root redirect
│
├── auth/                        # Public auth pages (no middleware)
│   ├── signin/page.tsx          #   Login form
│   ├── signup/page.tsx          #   Registration
│   ├── recover/page.tsx         #   Forgot password
│   ├── reset/page.tsx           #   Password reset
│   ├── verify-email/page.tsx    #   Email verification
│   └── invite/[id]/page.tsx     #   Invitation acceptance
│
├── onboard/page.tsx             # Profile onboarding (excluded from middleware)
│
├── (console)/                   # Protected route group (middleware enforced)
│   ├── layout.tsx               #   ConsoleLayout: sidebar, topbar, session
│   │
│   ├── dashboard/page.tsx       #   Role-based dashboard redirect
│   ├── audits/                  #   Unified audit management
│   │   ├── page.tsx             #     Audit Summary (role-aware <AuditList>)
│   │   └── [id]/               #     Single audit detail
│   │       ├── page.tsx         #       Audit overview
│   │       ├── artifacts/       #       Phase artifact management
│   │       ├── questionnaire/   #       Questionnaire response/review
│   │       ├── progress/        #       Milestone tracking
│   │       ├── report/          #       Report generation
│   │       └── scheduling/      #       Calendar scheduling
│   │
│   ├── request-audit/page.tsx   #   New audit request form
│   ├── open-audits/page.tsx     #   Supplier's pending audits
│   │
│   ├── buyer/                   #   Buyer-specific views
│   │   ├── dashboard/           #     Buyer KPI dashboard
│   │   ├── audits/              #     Buyer's audit list
│   │   ├── suppliers/           #     Supplier management + risk
│   │   └── capas/               #     CAPA tracking
│   │
│   ├── auditor/                 #   Auditor-specific views
│   │   ├── dashboard/           #     Auditor workload dashboard
│   │   ├── audits/              #     Assigned audits
│   │   ├── reports/             #     Report drafting
│   │   └── rfqs/                #     RFQ management
│   │
│   ├── supplier/                #   Supplier-specific views
│   │   ├── dashboard/           #     Supplier compliance dashboard
│   │   ├── api-library/         #     API documentation library
│   │   └── risk/                #     Supplier risk view
│   │
│   ├── admin/                   #   Tenant admin views
│   │   ├── dashboard/           #     Admin dashboard
│   │   ├── users/               #     User management
│   │   ├── module-config/       #     Module activation
│   │   └── workflow-studio/     #     Workflow builder
│   │
│   └── ... (60+ more pages)     #   Products, sites, CAPA, risk register,
│                                #   integrations, marketplace, calendar,
│                                #   document control, training, complaints,
│                                #   change controls, etc.
│
├── api/                         # Next.js API proxy routes
│   ├── next/audits/[...slug]/   #   Proxies to backend /api/audits/*
│   ├── next/dashboard/[role]/   #   Proxies to backend /api/dashboard/*
│   ├── ask-hawk/                #   AI assistant proxy
│   └── auto-fill-questionnaire/ #   AI autofill proxy
│
├── admin/                       # Platform admin (separate layout)
│   ├── audit-logs/
│   ├── security/
│   └── users/
│
└── platform/                    # Platform super-admin
    ├── tenants/
    ├── subscriptions/
    └── users/
```

### 5.2 Provider Hierarchy

```
  <html>
    <NuqsAdapter>                          URL state management
      <AppRouterCacheProvider>             MUI server-side cache
        <AppThemeProvider>                 Light/dark theme
          <BackdropProvider>               Modal overlays
            <AlertPopupProvider>           Confirmation dialogs
              <ToastProvider>              Toast notifications
                <KbarProvider>             Cmd+K command palette
                  <SidebarProvider>        Sidebar open/close
                    <NextIntlClientProvider>  i18n (en/hi)
                      <UniversalPlatformContext>  Module config
                        <SessionContext>   Current user session

                          {children}       Page content

                        </SessionContext>
                      </UniversalPlatformContext>
                    </NextIntlClientProvider>
                  </SidebarProvider>
                </KbarProvider>
              </ToastProvider>
            </AlertPopupProvider>
          </BackdropProvider>
        </AppThemeProvider>
      </AppRouterCacheProvider>
    </NuqsAdapter>
  </html>
```

### 5.3 Data Flow Pattern

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    Browser (Client)                          │
  │                                                              │
  │  ┌──────────────┐    ┌────────────────────────────────────┐ │
  │  │  React Hook  │    │  axiosInstance (client-side)        │ │
  │  │  Form + Zod  │    │  reads authTokenClient cookie      │ │
  │  │  validation  │    │  attaches Authorization: Bearer    │ │
  │  └──────┬───────┘    └──────────────┬─────────────────────┘ │
  │         │ submit                    │ GET/POST               │
  └─────────┼───────────────────────────┼───────────────────────┘
            │                           │
            v                           v
  ┌──────────────────┐       ┌──────────────────────────────┐
  │  Server Action   │       │  Next.js API Route           │
  │  (actions/*.ts)  │       │  (app/api/next/*/route.ts)   │
  │                  │       │                              │
  │  'use server'    │       │  Reads authToken cookie      │
  │  reads authToken │       │  Proxies to backend          │
  │  cookie via      │       │  via axiosInstance            │
  │  next/headers    │       │                              │
  └────────┬─────────┘       └──────────────┬───────────────┘
           │                                │
           └────────────────┬───────────────┘
                            │ HTTPS
                            v
              ┌──────────────────────────┐
              │  Express Backend API     │
              │  /api/*                  │
              └──────────────────────────┘
```

---

## 6. Data Architecture

### 6.1 Model Domains (154 Models)

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                         DATA MODEL MAP                              │
  │                                                                     │
  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐               │
  │  │   Identity   │  │   Tenant &   │  │  Workflow   │               │
  │  │              │  │Organization  │  │  Engine     │               │
  │  │ User         │  │ Tenant       │  │ WorkflowDef │               │
  │  │ BuyerProfile │  │ Organization │  │ WorkflowEvt │               │
  │  │ SupplierProf │  │ OrgUnit      │  │ WorkflowSub │               │
  │  │ AuditorProf  │  │ OrgSite      │  │ MilestoneDef│               │
  │  │ AuditorAffil │  │ OrgCatalog   │  │ MilestoneInst               │
  │  │ Subscription │  │ OrgUserAssign│  │ PhaseTracker│               │
  │  └──────┬──────┘  └──────┬───────┘  │ StatusDef   │               │
  │         │                │           │ StatusHist  │               │
  │         │                │           └──────┬──────┘               │
  │         │                │                  │                       │
  │  ┌──────┴──────────────┐ │    ┌─────────────┴─────────────────┐    │
  │  │   Audit Domain      │ │    │   Quality Domain               │    │
  │  │   (Core)            │ │    │                                │    │
  │  │ AuditRequestMaster  │ │    │  CapaV2 (15 sub-models)       │    │
  │  │ AuditArtifact       │ │    │  Assessment                   │    │
  │  │ AuditArtifactVer    │ │    │  AssessmentType               │    │
  │  │ AuditQuestions      │ │    │  AssessmentEvidence            │    │
  │  │ AuditReport         │ │    │  AssessmentFinding             │    │
  │  │ AuditEvent          │ │    │  Complaint                    │    │
  │  │ AuditTrail          │ │    │  TrainingRecord               │    │
  │  │ AuditNote           │ │    │  ManagementReview             │    │
  │  │ AuditSchedule       │ │    │  ChangeControl                │    │
  │  │ AuditCycleTemplate  │ │    │  DocumentControl              │    │
  │  │ AuditRfq/Quote      │ │    │  EquipmentMaster              │    │
  │  │ AuditRequestAlias   │ │    │  RiskItem                     │    │
  │  │ PreAuditQuestionnaire│ │    │  SupplierPreQualification     │    │
  │  └──────┬──────────────┘ │    └───────────────────────────────┘    │
  │         │                │                                         │
  │  ┌──────┴──────────────┐ │    ┌───────────────────────────────┐    │
  │  │  Template &         │ │    │  Risk & Intelligence          │    │
  │  │  Questionnaire      │ │    │                                │    │
  │  │                     │ │    │  BuyerRiskProfile              │    │
  │  │ Template            │ │    │  SupplierRiskMetrics           │    │
  │  │ TemplateQuestions   │ │    │  SupplierRiskEvent             │    │
  │  │ QuestionnaireUpload │ │    │  SupplierRiskSnapshot          │    │
  │  │ QuestionnaireSecAsn │ │    │  SupplierPublicSignal          │    │
  │  │ CustomAuditQuestion │ │    │  MonitoringSignal              │    │
  │  │ Categories          │ │    │  ComplianceStandard (6 models) │    │
  │  │ ReportTemplate      │ │    │  PublicIntel (10 models)       │    │
  │  │ ReportInstance      │ │    │  FdaInspection/Citation        │    │
  │  │ FormLayout          │ │    └───────────────────────────────┘    │
  │  └────────────────────┘  │                                         │
  │                           │    ┌───────────────────────────────┐    │
  │  ┌────────────────────┐  │    │  Document & Evidence          │    │
  │  │  Product & Supply  │  │    │                                │    │
  │  │  Chain             │  │    │  Document / DocumentView       │    │
  │  │                    │  │    │  DigilockerDoc (6 models)      │    │
  │  │ SupplierMasterProd │  │    │  SharePolicy / AccessEvent     │    │
  │  │ ProductSiteMapping │  │    │  Evidence / EvidenceUpload     │    │
  │  │ SupplierSite       │  │    │  ConsentRecord                │    │
  │  │ CatalogProductV2   │  │    └───────────────────────────────┘    │
  │  │ MarketplaceListing │  │                                         │
  │  │ Engagement         │  │    ┌───────────────────────────────┐    │
  │  │ QualificationCase  │  │    │  Notifications & Governance   │    │
  │  │ TransactionReview  │  │    │                                │    │
  │  └────────────────────┘  │    │  Notification (4 models)       │    │
  │                           │    │  NotificationDeliveryLog       │    │
  │  ┌────────────────────┐  │    │  AdminAuditLog                 │    │
  │  │  Integration       │  │    │  GovernanceAuditLog            │    │
  │  │                    │  │    │  ApprovalRequest               │    │
  │  │ IntegrationProvider│  │    │  SystemSetting                 │    │
  │  │ IntegrationConnect │  │    └───────────────────────────────┘    │
  │  │ IntegrationRunLog  │  │                                         │
  │  │ IntegrationMapping │  │    ┌───────────────────────────────┐    │
  │  │ ApiMaster          │  │    │  AI / Knowledge               │    │
  │  │ ApiPublicManufact  │  │    │                                │    │
  │  └────────────────────┘  │    │  AiActionMetric                │    │
  │                           │    │  KbArticle / KbChunk           │    │
  │                           │    │  HawkConversation              │    │
  │                           │    │  HawkUnanswered                │    │
  │                           │    │  AskHawkEvalRun                │    │
  │                           │    └───────────────────────────────┘    │
  └───────────────────────────┴────────────────────────────────────────┘
```

### 6.2 Multi-Tenancy Model

```
  Every document is scoped by tenant_id (or tenantOrgId).
  Data isolation is enforced at the query layer, not the DB layer.

  ┌──────────────────────────────────────────────────┐
  │                  Single MongoDB                   │
  │                                                   │
  │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
  │  │  Tenant A   │  │  Tenant B   │  │ Platform │ │
  │  │  (Buyer Co) │  │  (Pharma X) │  │  Global  │ │
  │  │             │  │             │  │          │ │
  │  │ tenant_id=  │  │ tenant_id=  │  │ tenant_  │ │
  │  │ 69ca586c... │  │ 695e4202... │  │ id=null  │ │
  │  │             │  │             │  │          │ │
  │  │ Users       │  │ Users       │  │ Templates│ │
  │  │ Audits      │  │ Audits      │  │ FDA Data │ │
  │  │ Products    │  │ Products    │  │ Standards│ │
  │  │ Sites       │  │ Sites       │  │ Policies │ │
  │  └─────────────┘  └─────────────┘  └──────────┘ │
  │                                                   │
  │  Fallback queries include tenant_id=null records  │
  │  (shared demo/platform data)                      │
  └──────────────────────────────────────────────────┘
```

---

## 7. Authentication & Authorization

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                    AUTHENTICATION FLOW                           │
  │                                                                  │
  │  Browser                  Frontend Server         Backend        │
  │  ───────                  ───────────────         ───────        │
  │                                                                  │
  │  1. User fills            2. Server Action        3. POST        │
  │     email + password         login()                /api/auth/   │
  │     in <LoginForm>           ───────────>           login        │
  │                                                     │            │
  │                           4. Receives JWT      <────┘            │
  │                              token                               │
  │                                                                  │
  │                           5. createSession()                     │
  │                              verifies JWT with                   │
  │                              NEXT_SESSION_SECRET                 │
  │                                                                  │
  │                           6. Sets cookies:                       │
  │                              authToken (httpOnly)                │
  │                              authTokenClient (JS-readable)       │
  │                              user_profile                        │
  │                                                                  │
  │  7. Browser navigates                                            │
  │     to /dashboard                                                │
  │     ─────────────>                                               │
  │                           8. middleware.ts                       │
  │                              reads authToken                     │
  │                              calls verifyToken()                 │
  │                              ──> NextResponse.next()             │
  │                              or redirect to /auth/signin         │
  │                                                                  │
  │  9. Page renders          10. Server components                  │
  │                               read cookies for user data         │
  │                               axios interceptor attaches         │
  │                               Bearer token to API calls          │
  └──────────────────────────────────────────────────────────────────┘

  JWT Payload:
  ┌──────────────────────────────────────┐
  │  {                                    │
  │    id:        "ObjectId",             │
  │    email:     "user@example.com",     │
  │    role:      "buyer",                │
  │    tenantId:  "ObjectId",             │
  │    invitedBy: "ObjectId" | null,      │
  │    iat:       1775808194,             │
  │    exp:       1778400194  (30 days)   │
  │  }                                    │
  └──────────────────────────────────────┘

  RBAC Roles:
  ┌──────────────────────────────────────────────────────────────┐
  │  superadmin   │ Platform-wide access, all tenants            │
  │  admin        │ Platform admin (legacy alias)                │
  │  tenant_admin │ Single-tenant admin                          │
  │  buyer        │ Initiates audits, assigns auditors           │
  │  auditor      │ Conducts audits, reviews, reports            │
  │  supplier     │ Responds to audits, provides evidence        │
  │  supplierUser │ Supplier team member (invited by supplier)   │
  └──────────────────────────────────────────────────────────────┘
```

---

## 8. Audit Workflow Engine

### 8.1 Phase State Machine

```
  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
  │ INITIATED │───>│   PREP    │───>│ PLANNING  │───>│ EXECUTION │
  │  (buyer)  │    │(supplier) │    │ (auditor) │    │ (auditor) │
  └───────────┘    └───────────┘    └───────────┘    └───────────┘
                                                           │
  ┌───────────────┐    ┌───────────┐    ┌───────────┐     │
  │ SURVEILLANCE  │<───│  CLOSURE  │<───│   CAPA    │<────┘
  │  (auditor)    │    │  (buyer)  │    │(supplier) │
  └───────────────┘    └───────────┘    └───────────┘
                                              │
  ┌───────────┐                               │
  │ FINDINGS  │<──────────────────────────────┘
  │ (auditor) │
  └───────────┘

  Each phase: status = NOT_STARTED | IN_PROGRESS | COMPLETED | BLOCKED
  Transitions are SEQUENTIAL ONLY (enforced by applyPhaseTransition)
```

### 8.2 Status Triple-Write

```
  Every state change updates THREE fields simultaneously:

  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  trackStatus (narrative)     "Request Created" → "Auditor        │
  │                               selected" → "Intimation sent" →   │
  │                               "Response completed" → "Closed"   │
  │                                                                  │
  │  questionnaireStatus         request_received → in_progress →   │
  │  (questionnaire flow)        sent_to_supplier → supplier_draft →│
  │                              supplier_submitted → review_       │
  │                              completed → auditor_submitted      │
  │                                                                  │
  │  high_status (numeric)       1 → 2 → 3 → 4 → 5                │
  │                                                                  │
  │  phaseState (structured)     { currentPhase, phases: {          │
  │                                INITIATED: { status, startedAt,  │
  │                                completedAt, ownerRole, ... },   │
  │                                PREP: { ... },                   │
  │                                ...                              │
  │                              }}                                  │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

### 8.3 Artifact Lifecycle Per Phase

```
  Phase          Required Artifacts              Owner
  ─────          ──────────────────              ─────
  INITIATED      INTIMATION_LETTER              buyer
  PREP           PRE_AUDIT_QUESTIONNAIRE        supplier
  PLANNING       SCOPE, AGENDA                  auditor
  EXECUTION      EXECUTION_QUESTIONNAIRE        supplier
  FINDINGS       FINDINGS_LOG,                  auditor
                 PRELIMINARY_DEFICIENCY_REPORT
  CAPA           CAPA_PLAN                      supplier
  CLOSURE        FINAL_REPORT                   buyer/auditor
  SURVEILLANCE   (none required)                auditor

  Artifact status flow:  draft → sent → in_progress → complete
  Each transition creates an immutable AuditArtifactVersion record.
```

### 8.4 Happy Path Sequence

```
  BUYER                    SUPPLIER                  AUDITOR
  ─────                    ────────                  ───────

  1. Create audit ──────>
     (INITIATED)

  2. Send intimation ───> 3. See audit in list
                          4. Accept intimation ──>

  5. Assign auditor ─────────────────────────────> 6. Accept assignment

                                                   7. Send PAQ/Scope

                                                   8. Send execution
                                                      questionnaire ──>
                          9. Fill questionnaire
                          10. Submit responses ──>
                                                   11. Review responses
                                                   12. Log findings

                          13. Submit CAPA plan ──>
                                                   14. Approve CAPA

  15. Close audit  <────────────────────────────── 16. Publish report
```

---

## 9. AI & Intelligence Layer

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    AI / INTELLIGENCE LAYER                       │
  │                                                                  │
  │  ┌────────────────────────────────────────────────────────────┐  │
  │  │                    AskHawk (Knowledge AI)                   │  │
  │  │                                                             │  │
  │  │  Document Ingestion → Vector Embedding → KB Chunks          │  │
  │  │  Intent Router → Hybrid Scoring → Reranking                 │  │
  │  │  Grounded Responses → Citation Validation                   │  │
  │  │                                                             │  │
  │  │  Models: KbArticle, KbChunk, HawkConversation              │  │
  │  │  Services: askHawkKnowledgeService, askHawkEmbeddingService │  │
  │  └────────────────────────────────────────────────────────────┘  │
  │                                                                  │
  │  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
  │  │  Form Auto-Fill      │  │  Document Intelligence           │ │
  │  │                      │  │                                   │ │
  │  │  agenticFormAutofill │  │  docIntelService                  │ │
  │  │  profileImport       │  │  questionnaireGeminiService       │ │
  │  │  aiPrefill           │  │  questionnaireExtractionService   │ │
  │  │                      │  │                                   │ │
  │  │  Signup prefill      │  │  PDF/DOCX → structured questions  │ │
  │  │  Questionnaire fill  │  │  Evidence extraction              │ │
  │  │  Evidence mapping    │  │  Compliance mapping               │ │
  │  └──────────────────────┘  └──────────────────────────────────┘ │
  │                                                                  │
  │  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
  │  │  Risk Scoring        │  │  Public Intelligence              │ │
  │  │                      │  │                                   │ │
  │  │  11 sub-services:    │  │  FDA Inspections/Citations sync   │ │
  │  │  scoringV1, V2       │  │  Public supplier signals          │ │
  │  │  buyerWeighting      │  │  Regulatory event monitoring      │ │
  │  │  evidenceTrust       │  │  Scheduled sync (cron)            │ │
  │  │  networkExposure     │  │                                   │ │
  │  │  trend analysis      │  │  10 public intel models           │ │
  │  │  improvements        │  │  331K+ FDA inspections            │ │
  │  │  reasons + breakdown │  │  272K+ FDA citations              │ │
  │  └──────────────────────┘  └──────────────────────────────────┘ │
  │                                                                  │
  │  LLM Providers:                                                  │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
  │  │ Google   │  │  OpenAI  │  │  Local   │                      │
  │  │ Gemini   │  │  GPT-4   │  │  LLaMA   │                      │
  │  │ (primary)│  │(fallback)│  │(fallback)│                      │
  │  └──────────┘  └──────────┘  └──────────┘                      │
  │                                                                  │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 10. Module System

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    MODULAR PLATFORM                              │
  │                                                                  │
  │  Each tenant activates only the modules they need.              │
  │  Controlled by TenantModuleConfig + ModuleConfig models.        │
  │  Enforced by moduleEntitlementMiddleware.                       │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────┐    │
  │  │                     CORE MODULES                         │    │
  │  │  (always available)                                      │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │  Auth &  │  │  User &  │  │ Tenant & │             │    │
  │  │  │  Session │  │ Profile  │  │   Org    │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  └─────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────┐    │
  │  │                QUALITY & AUDIT MODULES                   │    │
  │  │  (activatable per tenant)                                │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │ Supplier │  │  Audit   │  │ Question-│             │    │
  │  │  │  Audit   │  │ Workflow │  │  naire   │             │    │
  │  │  │(8-phase) │  │ Engine   │  │  Engine  │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │  CAPA    │  │  Risk    │  │Compliance│             │    │
  │  │  │  V2      │  │ Scoring  │  │ Standards│             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  └─────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────┐    │
  │  │                EQMS MODULES (Phase 0/1)                  │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │ Document │  │ Change   │  │ Training │             │    │
  │  │  │ Control  │  │ Control  │  │  Records │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │Complaint │  │Management│  │Equipment │             │    │
  │  │  │ Manager  │  │  Review  │  │  Master  │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐                            │    │
  │  │  │  Risk    │  │ Supplier │                            │    │
  │  │  │ Register │  │ Pre-Qual │                            │    │
  │  │  └──────────┘  └──────────┘                            │    │
  │  └─────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────┐    │
  │  │            UNIVERSAL PLATFORM OS MODULES                 │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │  Party   │  │ Workflow │  │Transaction│             │    │
  │  │  │Management│  │Definition│  │  Review   │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │  Module  │  │ Workflow │  │  CoC     │             │    │
  │  │  │  Config  │  │  Events  │  │ Tracker  │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  └─────────────────────────────────────────────────────────┘    │
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────┐    │
  │  │              MARKETPLACE & NETWORK                       │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
  │  │  │Supplier  │  │ Product  │  │Engagement│             │    │
  │  │  │Marketplace  │ Catalog  │  │ & Qualif │             │    │
  │  │  └──────────┘  └──────────┘  └──────────┘             │    │
  │  │                                                          │    │
  │  │  ┌──────────┐  ┌──────────┐                            │    │
  │  │  │ Auditor  │  │  Public  │                            │    │
  │  │  │ Network  │  │  Intel   │                            │    │
  │  │  └──────────┘  └──────────┘                            │    │
  │  └─────────────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 11. Integration Architecture

```
  ┌───────────────────────────────────────────────────────────────────┐
  │                    INTEGRATION LAYER                               │
  │                                                                    │
  │  ┌────────────────────────────────────────────────────────────┐   │
  │  │              Integration Framework                         │   │
  │  │                                                            │   │
  │  │  IntegrationProvider → IntegrationConnection → RunLog      │   │
  │  │  IntegrationMappingConfig → IntegrationAuditLog            │   │
  │  │                                                            │   │
  │  │  Scheduler: startIntegrationScheduler() (disabled in      │   │
  │  │             serverless mode)                                │   │
  │  └────────────────────────────────────────────────────────────┘   │
  │                                                                    │
  │  Provider Types:                                                   │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
  │  │ CSV      │ │ Generic  │ │ Demo     │ │ Stub Providers       │ │
  │  │ Upload   │ │ Webhook  │ │Simulator │ │                      │ │
  │  │          │ │          │ │          │ │  - TrackWise          │ │
  │  │ Manual   │ │ Inbound/ │ │ Sample   │ │  - SAP S/4HANA       │ │
  │  │ file     │ │ outbound │ │ data     │ │  - SFTP Drop         │ │
  │  │ import   │ │ webhooks │ │ gen      │ │  - Gmail/Outlook     │ │
  │  └──────────┘ └──────────┘ └──────────┘ │  - Google Drive/Box  │ │
  │                                          └──────────────────────┘ │
  │                                                                    │
  │  External Data Sources:                                            │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
  │  │ FDA Data │ │ AWS S3   │ │ AWS SES  │ │ Mailgun  │            │
  │  │Dashboard │ │ (files)  │ │ (email)  │ │ (email)  │            │
  │  │ (CSV)    │ │          │ │          │ │          │            │
  │  │ 331K+    │ │ Artifact │ │ Password │ │ Notif    │            │
  │  │ inspect  │ │ uploads  │ │ reset    │ │ delivery │            │
  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
  │                                                                    │
  │  Document Processing Pipeline:                                     │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
  │  │ pdf-parse│ │ Mammoth  │ │Tesseract │ │ Cheerio  │            │
  │  │ pdf-lib  │ │ (DOCX)   │ │ (OCR)    │ │ (HTML)   │            │
  │  │ pdf2pic  │ │          │ │          │ │          │            │
  │  │          │ │ word-    │ │ Image→   │ │ Web      │            │
  │  │ PDF→text │ │ extractor│ │ text     │ │ scraping │            │
  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
  └───────────────────────────────────────────────────────────────────┘
```

---

## 12. Notification System

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                 NOTIFICATION MODULE                               │
  │                 (src/modules/notifications/)                      │
  │                                                                   │
  │  ┌──────────────────────────────────────────────────────────┐    │
  │  │                Orchestrator Service                       │    │
  │  │                                                           │    │
  │  │  emitEvent(eventType, payload, context)                   │    │
  │  │       │                                                   │    │
  │  │       ├─ Resolve notification policies for this event     │    │
  │  │       ├─ Identify recipients by role/persona              │    │
  │  │       ├─ Apply channel preferences (IN_APP, EMAIL)        │    │
  │  │       └─ Create Notification + DeliveryLog records        │    │
  │  └──────────────────────────────────────────────────────────┘    │
  │                                                                   │
  │  Event Types:                                                     │
  │  ┌─────────────────────────────┬────────────────────────────┐    │
  │  │  audit.created              │  Buyer creates request      │    │
  │  │  audit.artifact.sent        │  Intimation/PAQ sent        │    │
  │  │  audit.supplier.decision    │  Supplier accepts/rejects   │    │
  │  │  audit.request.assigned     │  Auditor assigned           │    │
  │  │  audit.phase.prep_started   │  PREP phase begins          │    │
  │  │  audit.report.published     │  Final report issued        │    │
  │  │  capa.raised / capa.closed  │  CAPA lifecycle             │    │
  │  │  milestone.overdue          │  SLA breach                 │    │
  │  └─────────────────────────────┴────────────────────────────┘    │
  │                                                                   │
  │  Delivery Channels:                                               │
  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐   │
  │  │ IN_APP   │  │  EMAIL   │  │  REAL-TIME (Socket.IO)       │   │
  │  │          │  │          │  │                               │   │
  │  │ Stored   │  │ Handlebars│  │ WebSocket push to            │   │
  │  │ in DB    │  │ templates │  │ connected clients             │   │
  │  │ 3,550+   │  │ (6 .hbs) │  │                               │   │
  │  │ records  │  │          │  │                               │   │
  │  └──────────┘  └──────────┘  └──────────────────────────────┘   │
  │                                                                   │
  │  Governance:                                                      │
  │  ┌──────────────────────────────────────────────────────────┐    │
  │  │  NotificationEvent (9 event types)                        │    │
  │  │  NotificationPolicy (per persona × event × scope)         │    │
  │  │  UserNotificationPreference (per user overrides)          │    │
  │  │                                                           │    │
  │  │  Seeded by seedGovernanceIfEnabled() on startup           │    │
  │  │  (gated by SEED_GOVERNANCE=true env var)                  │    │
  │  └──────────────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────────────┘
```

---

## 13. API Surface

### 13.1 Route Categories (78 mount points)

```
  /api/auth                          Authentication (login, register, reset)
  /api/profile                       User profile CRUD
  /api/onboarding                    Vendor registration
  │
  ├── AUDIT CORE
  │   /api/audit-requests/           Audit CRUD, buyer/auditor/supplier lists
  │   /api/audits/:id/phases         Phase state machine
  │   /api/audits/:id/artifacts      Artifact CRUD + send
  │   /api/audits/:id/prep/*         PREP phase transitions
  │   /api/template-questions        Questionnaire question library
  │   /api/questionnaires            Questionnaire upload + extraction
  │   /api/rfqs                      Request for Quote
  │   /api/workflow-milestones       Milestone tracking
  │
  ├── BUYER / SUPPLIER / AUDITOR
  │   /api/buyer                     Buyer operations + risk routes
  │   /api/auditor                   Auditor operations
  │   /api/supplier-sites            Supplier site management
  │   /api/supplier-products         Supplier product catalog
  │   /api/product-site-mappings     Product ↔ site linkage
  │
  ├── QUALITY & COMPLIANCE
  │   /api/capas                     CAPA V1
  │   /api/capa-v2                   CAPA V2 (full lifecycle)
  │   /api/compliance/standards      Compliance standard library
  │   /api/auditor/compliance        Compliance run execution
  │   /api/assessment-types          Assessment type definitions
  │   /api/status-definitions        Status taxonomy
  │
  ├── EQMS (Phase 0/1)
  │   /api/supplier-prequalifications
  │   /api/document-control
  │   /api/risk-items
  │   /api/training-records
  │   /api/management-reviews
  │   /api/complaints
  │   /api/equipment
  │
  ├── UNIVERSAL PLATFORM OS
  │   /api/universal/module-config
  │   /api/universal/workflow-definitions
  │   /api/universal/parties
  │   /api/universal/change-controls
  │   /api/universal/events
  │   /api/universal/workflow-subjects
  │   /api/universal/transactions
  │
  ├── INTELLIGENCE & AI
  │   /api/askhawk                   AskHawk knowledge AI
  │   /api/ai-prefill                AI-powered form autofill
  │   /api/eqms-intel                EQMS intelligence connector
  │   /api/fda                       FDA data queries
  │   /api/public-intel              Public intelligence sync
  │   /api/doc-intel                 Document intelligence
  │
  ├── ORGANIZATION & MARKETPLACE
  │   /api/org-directory             Organization structure
  │   /api/org-catalog               Organization product catalog
  │   /api/engagements               B2B engagement management
  │   /api/qualification-cases       Supplier qualification
  │   /api/marketplace-catalog       Supplier marketplace
  │   /api/auditor-network           Auditor network directory
  │
  ├── ADMIN & GOVERNANCE
  │   /api/admin                     Tenant admin operations
  │   /api/platform                  Platform admin
  │   /api/v1/admin                  Governance admin
  │   /api/v1/user                   Governance user
  │   /api/table-variants            Table view configuration
  │   /api/system-settings           System-wide settings
  │
  ├── SUPPORTING
  │   /api/templates                 Template CRUD
  │   /api/report-templates          Report template CRUD
  │   /api/report-instances          Generated report instances
  │   /api/form-layouts              Dynamic form layouts
  │   /api/integrations              Integration management
  │   /api/digilocker                Digital locker (evidence vault)
  │   /api/notifications             Notification delivery
  │
  └── INFRASTRUCTURE
      /health                        Health check (no auth)
      /api-docs                      Swagger UI
      /api/dev/seed                  Dev seed (production-blocked)
      /api/dev/reset                 Dev reset (production-blocked)
      /api/e2e/seed-sai              E2E test seed (production-blocked)
```

---

## 14. Codebase Metrics

```
  ┌────────────────────────────────────────────────────────────┐
  │                    BACKEND                                  │
  │                                                             │
  │  Models:          154 Mongoose schemas                      │
  │  Controllers:      74 files (31,805 lines combined)         │
  │  Services:         80+ files across 16 subdirectories       │
  │  Routes:           60+ files, 78 mount points               │
  │  Middleware:        9 files                                  │
  │  Modules:           4 (auditEngine, capaV2, compliance,     │
  │                        notifications)                       │
  │  Schedulers:        4 (risk, notifications, publicIntel,    │
  │                        integrations)                        │
  │  Test Files:       22+ backend, 6 Playwright specs          │
  │  Key Collections: 196 in MongoDB                            │
  │  NPM Dependencies: 60+ production packages                 │
  │                                                             │
  │  Top controllers by size:                                   │
  │    auditPhaseController    2,748 lines                      │
  │    testArtifactController  2,361 lines                      │
  │    autoFillController      1,995 lines                      │
  │    buyerController         1,563 lines                      │
  │    capaV2Controller        1,358 lines                      │
  │    profileImportController 1,358 lines                      │
  │    askHawkController       1,109 lines                      │
  │    auditorController       1,097 lines                      │
  │    auditRequestController  1,059 lines                      │
  │    reportController        1,041 lines                      │
  ├────────────────────────────────────────────────────────────┤
  │                    FRONTEND                                 │
  │                                                             │
  │  Framework:       Next.js 15.5.11 (App Router)              │
  │  Pages:           126 routes                                │
  │  Components:      190+ files across 32 feature dirs         │
  │  Server Actions:    9 files                                 │
  │  API Clients:      30+ lib/ files                           │
  │  Schemas (Zod):     7 files                                 │
  │  Contexts:          8 providers                             │
  │  Hooks:             9 custom hooks                          │
  │  Locales:           2 (English, Hindi)                      │
  │  NPM Dependencies: 50+ production packages                 │
  │                                                             │
  │  Key component counts:                                      │
  │    audits/          40 files (largest feature)               │
  │    shared/          39 files (reusable)                      │
  │    onboard/         15 files                                 │
  │    profile/         11 files                                 │
  │    layout/           9 files                                 │
  │    products/         9 files                                 │
  ├────────────────────────────────────────────────────────────┤
  │                    DATA                                     │
  │                                                             │
  │  MongoDB Cluster:   hawkeye-dev.xzqm6.mongodb.net          │
  │  Databases:         2 (hawkeye, hawkeye_universal_dev)      │
  │  Collections:       196 (hawkeye), 184 (universal, empty)   │
  │  Largest tables:    fdainspections (331K), fdacitations     │
  │                     (272K), api-masters (16K)               │
  │  Templates:         8 (3 intimation, 2 PAQ, 1 scope,       │
  │                        1 PSCI SAQ, 1 final report)          │
  │  Template Questions: 345 across 7 template IDs              │
  │  Users:             19 legacy test users                    │
  │  Audit Records:     54+ across all tenants                  │
  └────────────────────────────────────────────────────────────┘
```

---

*Document generated from live codebase analysis of `codex_backend_01` (branch: dev, commit: c9561ee) and `codex_frontend_01` (branch: dev, commit: dccaa3e).*
