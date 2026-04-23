---
doc: repo-topology
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: reference
status: current
---

# Hawkeye Repository Topology

> Generated: 2026-03-23 | Branch: demo/dev | Read-only analysis

## Overview

Hawkeye is a multi-tenant SaaS platform for GMP audit and compliance management in the pharma/manufacturing sector. The monorepo contains a Node.js/Express backend and a Next.js 15 frontend, deployed separately to Vercel.

---

## Top-Level Layout

```
hawkeye-clean/
├── backend/                   # Node.js 18 + Express + MongoDB
│   ├── src/                   # Application source
│   ├── api/                   # Vercel serverless entry point
│   ├── docs/                  # Architecture documentation
│   ├── out/                   # Analysis outputs
│   ├── packs/                 # Audit module packs
│   ├── python_services/       # Python microservices (OCR, classification)
│   ├── scripts/               # Seed scripts and utilities
│   ├── seed/                  # Seed data files
│   ├── test/                  # Test fixtures and data
│   ├── uploads/               # Local file upload staging
│   ├── vercel.json            # Vercel deployment config
│   ├── .vercelignore          # Vercel upload exclusions
│   ├── Dockerfile             # Container config
│   ├── apprunner.yaml         # AWS AppRunner config
│   └── package.json
│
├── frontend/                  # Next.js 15.5 + React 18 + TypeScript
│   ├── app/                   # App Router (feature-based routes)
│   ├── components/            # Reusable React components
│   ├── actions/               # Redux/async actions
│   ├── hooks/                 # Custom React hooks
│   ├── contexts/              # React context providers
│   ├── schemas/               # Zod validation schemas
│   ├── constant/              # Frontend constants
│   ├── lib/                   # Utility functions
│   ├── i18n/ + locales/       # Internationalization
│   ├── public/                # Static assets
│   ├── vercel.json            # Vercel frontend config
│   ├── next.config.ts
│   └── package.json
│
├── _wt_backend_dev_artifacts_20260223/   # Git worktree: dev branch backend
└── _wt_frontend_dev_artifacts_20260223/ # Git worktree: dev branch frontend
```

---

## Backend Source Structure (`src/`)

```
src/
├── app.js                     # Express app setup, 81+ routes, schedulers
├── server.js                  # HTTP server + Socket.IO initialization
├── config/
│   ├── database.js            # MongoDB/Mongoose connection
│   ├── featureFlags.js        # Feature flag definitions
│   ├── loadEnv.js             # Environment variable loader
│   ├── polyfills.cjs          # Node.js compatibility polyfills
│   ├── sesTransporter.js      # AWS SES email transporter
│   └── swagger.js             # OpenAPI spec generation
├── constants/                 # Application-wide constants
├── controllers/               # 67 route controllers + 6 v2 controllers
│   ├── v2/                    # V2 API controllers (assessment-centric)
│   └── *.js                   # Feature controllers
├── docs/                      # Swagger/OpenAPI route documentation
├── helpers/                   # AI and email helper utilities
├── integrations/              # Third-party integration providers
│   └── services/              # Connection, ingestion, mapping, crypto
├── jobs/                      # Cron job definitions (risk, scheduling)
├── middlewares/               # 8 Express middleware files
├── models/                    # 128 Mongoose schema files
├── modules/                   # Custom plugin-like modules
│   ├── auditEngine/           # Phase/milestone builder (4 files)
│   ├── compliance/            # Standards constants (2 files)
│   └── notifications/         # Full notification subsystem (33 files)
├── routes/                    # 62 route files + v1/2 + v2/7
│   ├── v1/                    # Governance v1 routes
│   └── v2/                    # Assessment v2 routes
├── services/                  # 53 business logic service files
│   ├── ai/                    # AI-related services
│   ├── compliance/            # Compliance evaluation
│   ├── governance/            # Governance services
│   ├── integrations/          # Integration services
│   ├── publicIntel/           # FDA/regulatory data connectors
│   ├── risk/                  # Risk scoring algorithms
│   └── scheduling/            # Scheduling services
├── utils/                     # 15 utility functions
└── validators/                # 13 Zod/Joi request validators
```

---

## File Counts by Directory

| Directory         | Count | Purpose                                      |
|-------------------|-------|----------------------------------------------|
| models/           | 128   | MongoDB schemas (all entities)               |
| controllers/      | 73    | Route handlers (67 main + 6 v2)              |
| routes/           | 71    | Route definitions (62 + v1/2 + v2/7)        |
| services/         | 53    | Business logic services                      |
| modules/          | 39    | Custom module system (3 modules, 39 files)   |
| validators/       | 13    | Request validation schemas                   |
| integrations/     | 13    | Third-party integration providers            |
| utils/            | 15    | Utility functions                            |
| middlewares/      | 8     | Express middleware                           |
| helpers/          | 2     | AI and email helpers                         |
| jobs/             | 2     | Background job definitions                   |

---

## Custom Module System (`src/modules/`)

The platform uses a plugin-like architecture under `src/modules/`:

### `auditEngine/` (4 files)
- `assessmentBuilder.js` — Builds assessment phase/milestone structures from templates
- `constants.js` — Phase keys: PREP, SCOPE_AGENDA, SCHEDULING, EXECUTION, REPORTING, FOLLOWUP_CAPA
- `modulePacks.js` — Audit module pack definitions (cGMP, WHO-GMP, etc.)
- `phaseRules.js` — Phase advancement prerequisite rules

### `compliance/` (2 files)
- `constants.js` — Compliance framework constants
- `defaultStandards.js` — Default compliance standard templates

### `notifications/` (33 files)
Full notification subsystem:
```
notifications/
├── controllers/   debugController, notificationController, preferenceController
├── models/        notificationModel, deliveryLogModel, folderModel, labelModel, preferenceModel
├── routes/        index.js, adminDebugRoutes.js
├── services/      emailService, orchestratorService, scheduler, socket, index
├── templates/     5 Handlebars email templates (AUDIT_REQUEST_CREATED, CERT_EXPIRING, etc.)
├── utils/         templateRenderer.js
├── NotificationEvent.js / .ts
├── notificationRules.js
└── README.md
```

---

## Frontend Structure (`app/`)

Next.js App Router with feature-based route groups:

```
app/
├── (console)/           # Main authenticated app shell
│   ├── admin/           # Admin tools
│   ├── assessments/     # Assessment management
│   ├── audits/          # Audit lifecycle UI
│   ├── auditor/         # Auditor-specific views
│   ├── dashboard/       # Analytics dashboards
│   ├── digilocker/      # DigiLocker document access
│   ├── reports/         # Report generation
│   ├── workflow-os/     # Workflow management UI
│   └── ...              # 20+ feature groups
├── admin/               # System admin routes
├── auditor/             # Auditor portal
└── auth/                # Authentication pages
```

**Component categories (27 total):**
admin, askhawk, assessments, audits, auth, integrations, notifications, reports, risk, shared (layout/UI), workflow, workflow-os, digilocker, + feature-specific

---

## Deployment Architecture

```
┌─────────────────┐         ┌──────────────────────┐
│   Frontend      │         │   Backend            │
│   Next.js 15    │──HTTPS──▶  Node.js/Express     │
│   Vercel        │         │   Vercel Serverless  │
│ hawkeye-frontend│         │ wtbackenddev...      │
│    -teal        │         │ .vercel.app          │
└─────────────────┘         └──────────┬───────────┘
                                        │
                            ┌───────────▼───────────┐
                            │   MongoDB Atlas       │
                            │   (128 collections)   │
                            └───────────────────────┘
```

**Branch Strategy:**
- `demo` branch → checked out at `backend/` and `frontend/`
- `dev` branch → worktrees at `_wt_backend_dev_artifacts_20260223/` and `_wt_frontend_dev_artifacts_20260223/`
- Vercel deploys from `dev` branch worktrees

---

## Key Background Services (started in `app.js`)

| Scheduler | Frequency | Purpose |
|-----------|-----------|---------|
| `startNotificationSchedulers()` | Continuous | Email/socket notification delivery |
| `startPublicIntelScheduler()` | Daily | FDA/regulatory data sync |
| `startRiskScheduler()` | Periodic | Risk score recalculation |
| `startIntegrationScheduler()` | Configurable | Third-party data ingestion |

---

## Entry Points

| File | Purpose |
|------|---------|
| `src/server.js` | HTTP server + Socket.IO, binds port 8000 |
| `src/app.js` | Express app with all 81+ routes and middleware |
| `api/index.js` | Vercel serverless handler (exports Express app) |
| `frontend/app/layout.tsx` | Next.js root layout |
| `frontend/middleware.ts` | Next.js auth/routing middleware |
