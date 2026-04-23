---
doc: 01-architecture-technical
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: platform-docs
status: current
---

# Hawkeye Platform — Technical Architecture

> Version: Phase 1 EQMS  |  Last updated: 2026-03-27

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Topology](#3-system-topology)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Layer](#6-database-layer)
7. [Authentication & Security](#7-authentication--security)
8. [Universal Platform OS](#8-universal-platform-os)
9. [EQMS Module Architecture](#9-eqms-module-architecture)
10. [Audit Lifecycle Engine](#10-audit-lifecycle-engine)
11. [API Design Conventions](#11-api-design-conventions)
12. [Deployment Architecture](#12-deployment-architecture)
13. [Module Feature Flags](#13-module-feature-flags)

---

## 1. System Overview

Hawkeye is a cloud-native, multi-tenant B2B platform for **pharma supply-chain quality management**. It connects Buyers (pharma manufacturers), Suppliers (API/excipient makers), and Auditors in a unified compliance workflow.

### Core Capabilities

| Domain | Capability |
|---|---|
| **Supplier Quality** | Qualification, onboarding, risk scoring, RFQs |
| **Audit Management** | End-to-end GxP/GMP audit lifecycle (8 phases) |
| **EQMS** | Document Control, NC, CAPA, Risk Register, Training, Complaints, Management Review |
| **Evidence** | DigiLocker vault, artifact tracking, RAG-powered audit reports |
| **Intelligence** | FDA inspection data, AI-powered compliance analytics, AskHawk |
| **Platform OS** | Universal workflow engine — Party, Event, Subject, ChangeControl, CoC |

---

## 2. Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js 15 (App Router)  ·  TypeScript  ·  MUI v6         │
│  next-intl (i18n)  ·  Phosphor Icons  ·  Axios             │
└─────────────────────────────────────────────────────────────┘
                              │ HTTPS / REST
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│  Node.js (ESM)  ·  Express 5  ·  JWT (jsonwebtoken)        │
│  bcryptjs  ·  Mongoose 8  ·  Joi validation                 │
│  OpenAI / Gemini  ·  AWS S3  ·  Mailgun                    │
└─────────────────────────────────────────────────────────────┘
                              │ MongoDB Wire Protocol
┌─────────────────────────────────────────────────────────────┐
│                       DATA LAYER                             │
│  MongoDB Atlas (hawkeye-dev cluster)                        │
│  Database: hawkeye  ·  Multi-tenant via tenantId field      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. System Topology

```mermaid
graph TB
    subgraph Internet
        U1[Buyer / QA Manager]
        U2[Supplier]
        U3[Auditor]
        U4[Platform Admin]
    end

    subgraph Vercel Edge Network
        FE["Frontend<br/>hawkeye-frontend-dev-chi.vercel.app<br/>Next.js 15 SSR"]
        BE["Backend API<br/>hawkeye-backend-dev.vercel.app<br/>Express + Node.js"]
    end

    subgraph MongoDB Atlas
        DB[(hawkeye DB<br/>55+ collections)]
    end

    subgraph AWS
        S3[S3 Bucket<br/>Document Storage]
    end

    subgraph External APIs
        OPENAI[OpenAI GPT-4o]
        GEMINI[Google Gemini]
        FDA[FDA API<br/>api-datadashboard.fda.gov]
        MAILGUN[Mailgun<br/>Email]
    end

    U1 --> FE
    U2 --> FE
    U3 --> FE
    U4 --> FE

    FE -->|"Next.js API routes<br/>/api/next/**"| BE
    FE -->|"Direct REST<br/>/api/**"| BE

    BE --> DB
    BE --> S3
    BE --> OPENAI
    BE --> GEMINI
    BE --> FDA
    BE --> MAILGUN

    style FE fill:#4f46e5,color:#fff
    style BE fill:#059669,color:#fff
    style DB fill:#d97706,color:#fff
```

---

## 4. Frontend Architecture

### App Router Structure

```
app/
├── (console)/           ← Authenticated app shell
│   ├── layout.tsx       ← ConsoleShell + SessionProvider + UniversalPlatformProvider
│   ├── audits/          ← Audit management
│   ├── document-control/← EQMS: Document Control
│   ├── nonconformance/  ← EQMS: NC Manager
│   ├── risk-register/   ← EQMS: FMEA Risk Register
│   ├── training/        ← EQMS: Training & Competency
│   ├── management-review/← EQMS: Management Review
│   ├── complaint-manager/← EQMS: Complaints
│   ├── change-controls/ ← Universal Platform OS
│   ├── events/          ← Universal Platform OS
│   ├── parties/         ← Universal Platform OS
│   └── admin/
│       └── module-config/ ← Tenant module toggles
├── auth/                ← Unauthenticated
│   └── signin/
└── api/
    └── next/            ← Next.js API proxy routes → Backend
```

### Context Providers

```mermaid
graph TD
    A["SessionProvider<br/>(auth state, user profile)"]
    B["UniversalPlatformProvider<br/>(vocab + module flags)"]
    C["ConsoleShell<br/>(layout: sidebar or top-bar)"]
    D["Page Component"]

    A --> B --> C --> D
```

### UniversalPlatformContext

Every page inside `(console)/` has access to:

```typescript
const { vocab, modules, loading, refresh } = useUniversalPlatform();
// vocab.audit  → "Audit" | "Inspection" | "Review"  (per tenant)
// modules.DOCUMENT_CONTROL → true | false
// modules.EVENT_MANAGEMENT → true | false
```

Module gates work like:
```typescript
if (!modules.RISK_MANAGEMENT) return <Alert>Module not enabled</Alert>;
```

### Navigation Architecture

```mermaid
graph LR
    subgraph "Top Bar (MegaMenu)"
        Q[Quality]
        SC[Supply Chain]
        EV[Evidence]
        MP[Marketplace]
        AN[Analytics]
        EQ[EQMS]
        PL[Platform OS]
    end

    subgraph "Sidebar (app-config.ts)"
        DISC[Discovery]
        PROC[Procurement]
        OPS[Operations]
        ASSETS[Assets]
        ADMIN[Admin]
        EQMS2[EQMS]
        POS[Platform OS]
    end

    Q --> DISC
    EQ --> EQMS2
    PL --> POS
```

---

## 5. Backend Architecture

### Request Lifecycle

```mermaid
sequenceDiagram
    participant C as Client (Browser)
    participant N as Next.js API Route
    participant M as Express Middleware
    participant R as Route Handler
    participant DB as MongoDB

    C->>N: POST /api/next/audits/[slug]
    N->>M: Proxy → backend /api/auth/...

    Note over M: 1. initializeRuntime() (DB connect)
    Note over M: 2. authenticate() — verify JWT
    Note over M: 3. resolveTenant() — extract tenantId
    Note over M: 4. permit() — role check

    M->>R: req.user, req.tenantId set
    R->>DB: Mongoose query { tenantId: req.tenantId }
    DB-->>R: Documents
    R-->>C: JSON response
```

### Route Namespace Map

| Namespace | Purpose |
|---|---|
| `/api/auth/*` | Login, register, reset password, verify email |
| `/api/buyer/*` | Buyer-specific: suppliers, risk, CAPAs |
| `/api/auditor/*` | Auditor RFQs, compliance runs |
| `/api/audit-requests/*` | Audit request CRUD |
| `/api/universal/module-config` | Tenant module config (EQMS gates) |
| `/api/universal/parties` | Party directory |
| `/api/universal/events` | Workflow events (NCs, incidents) |
| `/api/universal/change-controls` | Change control records |
| `/api/document-control` | DCM — SOP/policy lifecycle |
| `/api/risk-items` | FMEA risk register |
| `/api/training-records` | Training assignments |
| `/api/management-reviews` | ISO 9001 §9.3 reviews |
| `/api/complaints` | Complaint Manager |
| `/api/supplier-prequalifications` | PQ desk review |
| `/api/rfqs/*` | RFQ procurement |
| `/api/capas/*` | CAPA management |
| `/api/digilocker/*` | Document vault |
| `/api/v2/*` | V2 product library, org catalog |

### Middleware Stack

```mermaid
graph LR
    A[Request] --> B[JSON Parser]
    B --> C[CORS]
    C --> D[initializeRuntime<br/>DB connect + seed governance]
    D --> E{Route Match}
    E -->|/api/auth/*| F[No auth required]
    E -->|All other /api/*| G[authenticate<br/>JWT verify]
    G --> H[resolveTenant<br/>extract tenantId]
    H --> I[permit<br/>role check]
    I --> J[Route Handler]
```

---

## 6. Database Layer

### Multi-Tenancy Pattern

Every document that belongs to a tenant has `tenantId` (string) as a required, indexed field. All queries include `{ tenantId: req.tenantId }` automatically.

```javascript
// Pattern used in every EQMS route handler
const items = await Model.find({ tenantId: req.tenantId, ...filters });
```

### Key Collections

```mermaid
erDiagram
    users {
        ObjectId _id
        string email
        string password
        string role
        ObjectId tenant_id
        bool isEmailVerified
    }
    tenants {
        ObjectId _id
        string name
        string type
        string status
    }
    audit_requests_master {
        ObjectId _id
        string tenantId
        string auditPhase
        string facilityOutcome
        ObjectId buyerOrgId
        ObjectId supplierOrgId
    }
    document_controls {
        ObjectId _id
        string tenantId
        string docNumber
        string status
        number versionMajor
        number versionMinor
    }
    risk_items {
        ObjectId _id
        string tenantId
        number severity
        number occurrence
        number detectability
        number rpn
        string riskBand
    }
    training_records {
        ObjectId _id
        string tenantId
        string status
        string competencyLevel
    }
    complaints {
        ObjectId _id
        string tenantId
        string complaintNumber
        string severity
        string status
    }
    management_reviews {
        ObjectId _id
        string tenantId
        string reviewNumber
        string qmsAdequacy
    }

    users }|--|| tenants : "belongs to"
    audit_requests_master }|--|| tenants : "scoped to"
    document_controls }|--|| tenants : "scoped to"
    risk_items }|--|| tenants : "scoped to"
```

### Auto-Generated ID Sequences

| Model | Format | Example |
|---|---|---|
| Document Control | `DOC-YYYY-NNNN` | `DOC-2026-0001` |
| Management Review | `MR-YYYY-NNNN` | `MR-2026-0001` |
| Change Control | `CCR-YYYY-NNNN` | `CCR-2026-0001` |
| Supplier Pre-Qual | `PQ-YYYY-NNNN` | `PQ-2026-0001` |
| Complaint | `CMP-YYYY-NNNN` | `CMP-2026-0001` |

Generated via Mongoose pre-save hooks with `findOne().sort({ id: -1 })` to get the last sequence number.

### FMEA RPN Computation (Auto, pre-save hook)

```
RPN = Severity (1–10) × Occurrence (1–10) × Detectability (1–10)

Risk Band:
  RPN ≥ 200  → CRITICAL  🔴
  RPN ≥ 125  → HIGH      🟠
  RPN ≥  60  → MEDIUM    🟡
  RPN <  60  → LOW       🟢
```

---

## 7. Authentication & Security

### Login Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant DB as MongoDB

    U->>FE: POST email + password
    FE->>BE: POST /api/auth/login
    BE->>DB: findOne({ email }).select("+password")
    DB-->>BE: User document

    alt User not found
        BE-->>FE: 400 Invalid credentials
    else Email not verified
        BE-->>FE: 401 Email not verified
    else Password mismatch
        BE->>BE: bcrypt.compare(password, hash)
        BE-->>FE: 400 Invalid credentials
    else Success
        BE->>BE: jwt.sign({ id, role, email, tenantId }, JWT_SECRET, 30d)
        BE-->>FE: 200 { token, role, tenantId }
        FE->>FE: Set cookie authToken
        FE->>U: Redirect to /dashboard
    end
```

### JWT Token Structure

```json
{
  "id": "<ObjectId>",
  "role": "buyer | supplier | auditor | tenant_admin | superadmin",
  "email": "user@example.com",
  "tenantId": "<ObjectId>",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Role Hierarchy

```mermaid
graph TD
    SA[superadmin<br/>Platform-wide access]
    TA[tenant_admin<br/>Full tenant access]
    B[buyer<br/>Quality manager]
    A[auditor<br/>External auditor]
    S[supplier<br/>Supplier company]
    SU[supplierUser<br/>Supplier team member]

    SA --> TA --> B
    TA --> A
    TA --> S --> SU

    style SA fill:#7c3aed,color:#fff
    style TA fill:#2563eb,color:#fff
    style B fill:#059669,color:#fff
    style A fill:#d97706,color:#fff
    style S fill:#db2777,color:#fff
```

---

## 8. Universal Platform OS

The Platform OS provides **5 primitives** that can model any compliance domain:

```mermaid
graph TB
    subgraph "Universal Platform OS Primitives"
        PA[Party<br/>Any legal/org entity]
        SB[Subject<br/>Inspectable asset<br/>product/site/process]
        WF[WorkflowDefinition<br/>State machine template]
        EV[WorkflowEvent<br/>NC / Incident / Audit / Complaint]
        CC[ChangeControl<br/>CCR with approval steps]
        TR[TrustScore<br/>Computed risk score]
    end

    PA -->|"has"| SB
    WF -->|"governs"| EV
    EV -->|"triggers"| CC
    PA -->|"earns"| TR

    subgraph "Module Config"
        MC[ModuleConfig<br/>Per-tenant ON/OFF flags<br/>+ vocab overrides]
    end

    MC -->|"gates"| EV
    MC -->|"gates"| CC
```

### Vocabulary Override System

Tenants can rename any domain concept:

| Key | Pharma default | Alternative (e.g. Food) |
|---|---|---|
| `audit` | Audit | Inspection |
| `supplier` | Supplier | Farm / Vendor |
| `buyer` | Buyer | Retailer |
| `finding` | Finding | Observation |
| `capa` | CAPA | Corrective Action |
| `site` | Site | Facility |

---

## 9. EQMS Module Architecture

```mermaid
graph LR
    subgraph "Phase 1 EQMS Modules"
        DC[Document Control<br/>DOC lifecycle<br/>DRAFT→EFFECTIVE]
        NC[Nonconformance<br/>NC / Deviation / OOS]
        CM[Complaint Manager<br/>Customer / Patient / Regulatory]
        RR[Risk Register<br/>FMEA — RPN auto-computed]
        TR[Training & Competency<br/>Assignments + completion]
        MR[Management Review<br/>ISO 9001 §9.3]
        CH[Change Controls<br/>CCR impact assessment]
        PQ[Supplier Pre-Qualification<br/>Desk review before full audit]
    end

    subgraph "Module Gates (ModuleConfig)"
        DOC_GATE[DOCUMENT_CONTROL]
        EVENT_GATE[EVENT_MANAGEMENT]
        RISK_GATE[RISK_MANAGEMENT]
        TRAIN_GATE[TRAINING_MANAGEMENT]
        MR_GATE[MANAGEMENT_REVIEW]
        CC_GATE[CHANGE_CONTROL]
        SQ_GATE[SUPPLIER_QUALITY]
    end

    DOC_GATE -->|"enables"| DC
    EVENT_GATE -->|"enables"| NC
    EVENT_GATE -->|"enables"| CM
    RISK_GATE -->|"enables"| RR
    TRAIN_GATE -->|"enables"| TR
    MR_GATE -->|"enables"| MR
    CC_GATE -->|"enables"| CH
    SQ_GATE -->|"enables"| PQ
```

### Document Control Lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> UNDER_REVIEW : Submit for review
    UNDER_REVIEW --> APPROVED : All approvers sign
    UNDER_REVIEW --> DRAFT : Rejected — return to author
    APPROVED --> EFFECTIVE : Publish (set effective date)
    EFFECTIVE --> SUPERSEDED : New version created
    EFFECTIVE --> WITHDRAWN : Withdraw with reason
    SUPERSEDED --> [*]
    WITHDRAWN --> [*]
```

### NC / Complaint / Event Lifecycle

```mermaid
stateDiagram-v2
    [*] --> OPEN
    OPEN --> UNDER_INVESTIGATION : Assign investigator
    UNDER_INVESTIGATION --> PENDING_CAPA : Root cause identified
    PENDING_CAPA --> CAPA_IN_PROGRESS : CAPA created
    CAPA_IN_PROGRESS --> PENDING_CLOSURE : CAPA verified
    PENDING_CLOSURE --> CLOSED : Quality Manager sign-off
    OPEN --> CANCELLED : Duplicate / invalid
```

---

## 10. Audit Lifecycle Engine

### 8-Phase GMP Audit

```mermaid
stateDiagram-v2
    direction LR
    [*] --> INITIATED : Audit requested
    INITIATED --> PREP : Intimation letter sent
    PREP --> PLANNING : Pre-audit questionnaire received
    PLANNING --> EXECUTION : Scope & agenda confirmed\n+ COI declaration signed
    EXECUTION --> FINDINGS : GMP checklist complete\n+ Opening meeting minutes
    FINDINGS --> CAPA : PDR issued at closing meeting
    CAPA --> CLOSURE : CAPA plan accepted
    CLOSURE --> SURVEILLANCE : Final report issued
    SURVEILLANCE --> [*]
```

### Facility Outcome (Phase 0 GxP)

```mermaid
graph LR
    A[Audit Execution Complete] --> B{Facility Outcome}
    B -->|All critical GMP met| C["✅ SATISFACTORY"]
    B -->|Minor gaps, conditions set| D["⚠️ CONDITIONALLY SATISFACTORY"]
    B -->|Critical failures found| E["❌ UNSATISFACTORY"]

    C --> F[Full Approval]
    D --> G[Approval with Action Plan]
    E --> H[Rejected — Re-audit Required]

    style C fill:#059669,color:#fff
    style D fill:#d97706,color:#fff
    style E fill:#dc2626,color:#fff
```

### Audit Artifacts per Phase

| Phase | Required Artifacts |
|---|---|
| INITIATED | Intimation Letter, RFQ |
| PREP | Pre-Audit Questionnaire, DRL |
| PLANNING | Scope, Agenda, **COI Declaration** |
| EXECUTION | Execution Questionnaire, GMP Checklist, **Opening Meeting Minutes** |
| FINDINGS | Findings Log, **Preliminary Deficiency Report** |
| CAPA | CAPA Plan |
| CLOSURE | Final Report |

---

## 11. API Design Conventions

### URL Patterns

```
GET    /api/{resource}              → List (with query filters)
GET    /api/{resource}/:id          → Single record
POST   /api/{resource}              → Create
PUT    /api/{resource}/:id          → Full update
DELETE /api/{resource}/:id          → Delete (guarded by status)

POST   /api/{resource}/:id/approve  → State transition: approve
POST   /api/{resource}/:id/close    → State transition: close
POST   /api/{resource}/:id/publish  → State transition: publish
```

### Standard Error Responses

```json
{ "error": "Description of what went wrong" }
```

HTTP status codes:
- `400` — Validation error / business rule violation
- `401` — Not authenticated
- `403` — Not authorized (wrong role)
- `404` — Not found
- `409` — Conflict (e.g. deleting non-DRAFT document)
- `500` — Internal server error

### Tenant Isolation

Every response is filtered by `tenantId`. Cross-tenant data access is architecturally impossible — the tenant is extracted from the verified JWT and injected into every query.

---

## 12. Deployment Architecture

```mermaid
graph TB
    subgraph "GitHub"
        REPO[hawkeye-clean repo<br/>monorepo: /backend + /frontend]
    end

    subgraph "Vercel Projects"
        VFE[hawkeye-frontend-dev<br/>Next.js SSR<br/>hawkeye-frontend-dev-chi.vercel.app]
        VBE[hawkeye-backend-dev<br/>Express Serverless<br/>hawkeye-backend-dev.vercel.app]
    end

    subgraph "Vercel Edge"
        EDGE[Edge Network<br/>CDN + SSL Termination]
    end

    subgraph "Environment Variables"
        ENV1[MONGO_URI — Atlas connection string]
        ENV2[JWT_SECRET — Token signing key]
        ENV3[NODE_ENV — production]
        ENV4[OPENAI_API_KEY]
        ENV5[AWS_S3_BUCKET + credentials]
    end

    REPO -->|vercel --prod| VFE
    REPO -->|vercel --prod| VBE
    EDGE --> VFE
    EDGE --> VBE
    ENV1 --> VBE
    ENV2 --> VBE
    ENV3 --> VBE
```

### Environment Setup Checklist

| Variable | Where | Notes |
|---|---|---|
| `MONGO_URI` | Backend Vercel | Atlas connection string, `hawkeye` db |
| `JWT_SECRET` | Backend Vercel | `hawkeye-jwt-secret-nov-20-2024` |
| `NODE_ENV` | Backend Vercel | Must be exactly `production` (no trailing newline) |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend Vercel | Points to backend URL |
| `OPENAI_API_KEY` | Backend Vercel | GPT-4o for audit RAG + AskHawk |
| `AWS_S3_BUCKET` | Backend Vercel | `hawkeye-backend-storage` |

---

## 13. Module Feature Flags

Modules are toggled **per-tenant** via the `ModuleConfig` collection. The frontend reads the active config on every session via `GET /api/universal/module-config/active`.

### Available Modules

| Key | Default | Controls |
|---|---|---|
| `AUDIT_MANAGEMENT` | ✅ ON | All audit pages |
| `DOCUMENT_CONTROL` | ✅ ON | `/document-control` |
| `CAPA_MANAGEMENT` | ✅ ON | `/buyer/capas` |
| `SUPPLIER_QUALITY` | ✅ ON | `/supplier-prequalification` |
| `REGULATORY_INTEL` | ✅ ON | `/fda-dashboard`, `/insights` |
| `AI_ASSISTANT` | ✅ ON | AskHawk, AI prefill |
| `RFQ_PROCUREMENT` | ✅ ON | `/rfqs` |
| `CHANGE_CONTROL` | ❌ OFF | `/change-controls` |
| `EVENT_MANAGEMENT` | ❌ OFF | `/nonconformance`, `/events`, `/complaint-manager` |
| `TRAINING_MANAGEMENT` | ❌ OFF | `/training` |
| `RISK_MANAGEMENT` | ❌ OFF | `/risk-register` |
| `MANAGEMENT_REVIEW` | ❌ OFF | `/management-review` |
| `ASSET_MANAGEMENT` | ❌ OFF | Future |
| `CHAIN_OF_CUSTODY` | ❌ OFF | `/coc-tracker` |
| `TRANSACTION_REVIEW` | ❌ OFF | `/transactions` |

> **To enable modules:** Log in as tenant admin → navigate to `/admin/module-config` → toggle ON → click Save.
