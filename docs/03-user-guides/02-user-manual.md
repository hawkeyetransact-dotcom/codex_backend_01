---
doc: 02-user-manual
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: user-guides
status: current
---

# Hawkeye Platform — User Manual

> Version: Phase 1 EQMS  |  Last updated: 2026-03-27

---

## Table of Contents

1. [Personas Overview](#1-personas-overview)
2. [Getting Started — Login & Navigation](#2-getting-started--login--navigation)
3. [Persona: Platform Admin](#3-persona-platform-admin)
4. [Persona: Quality Manager / Tenant Admin](#4-persona-quality-manager--tenant-admin)
5. [Persona: Buyer (QA Analyst)](#5-persona-buyer-qa-analyst)
6. [Persona: Supplier](#6-persona-supplier)
7. [Persona: Auditor](#7-persona-auditor)
8. [Core Workflow: End-to-End GMP Audit](#8-core-workflow-end-to-end-gmp-audit)
9. [Core Workflow: EQMS — Nonconformance to CAPA Closure](#9-core-workflow-eqms--nonconformance-to-capa-closure)
10. [Core Workflow: Document Control Lifecycle](#10-core-workflow-document-control-lifecycle)
11. [Core Workflow: Supplier Qualification Journey](#11-core-workflow-supplier-qualification-journey)
12. [Core Workflow: Complaint Management](#12-core-workflow-complaint-management)
13. [Core Workflow: Management Review Cycle](#13-core-workflow-management-review-cycle)
14. [Quick Reference — All URLs by Role](#14-quick-reference--all-urls-by-role)

---

## 1. Personas Overview

```mermaid
graph LR
    subgraph "Hawkeye User Personas"
        PA["🔑 Platform Admin<br/>platform.admin@example.com<br/>Role: superadmin<br/>Sees: Everything"]
        QM["📋 Quality Manager<br/>buyer.admin@example.com<br/>Role: tenant_admin<br/>Sees: Full tenant"]
        BU["🛒 Buyer / QA Analyst<br/>Role: buyer<br/>Sees: Quality & Supply Chain"]
        SU["🏭 Supplier<br/>supplier.admin@example.com<br/>Role: supplier<br/>Sees: Own data + tasks"]
        AU["🔍 Auditor<br/>Role: auditor<br/>Sees: Assigned audits & RFQs"]
    end

    PA -->|"Configures"| QM
    QM -->|"Manages"| BU
    QM -->|"Engages"| SU
    BU -->|"Requests audit from"| AU
    AU -->|"Audits"| SU

    style PA fill:#7c3aed,color:#fff
    style QM fill:#2563eb,color:#fff
    style BU fill:#059669,color:#fff
    style SU fill:#db2777,color:#fff
    style AU fill:#d97706,color:#fff
```

### Persona Comparison Table

| Capability | Platform Admin | Quality Manager | Buyer | Supplier | Auditor |
|---|:---:|:---:|:---:|:---:|:---:|
| Platform settings | ✅ | — | — | — | — |
| Tenant management | ✅ | — | — | — | — |
| Module config | ✅ | ✅ | — | — | — |
| EQMS (NCs, DCM, Risk) | ✅ | ✅ | ✅ | — | ✅ |
| Audit requests | ✅ | ✅ | ✅ | — | — |
| Audit execution | ✅ | ✅ | — | ✅ (answer) | ✅ (lead) |
| Supplier directory | ✅ | ✅ | ✅ | — | — |
| DigiLocker | ✅ | ✅ | ✅ | ✅ | ✅ |
| RFQs | ✅ | ✅ | ✅ | — | ✅ |
| Training records | ✅ | ✅ | ✅ | — | — |
| Insights / FDA | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 2. Getting Started — Login & Navigation

### Step 1: Sign In

1. Navigate to **`/auth/signin`**
2. Enter your email and password
3. Click **Sign In**

> **Test credentials (all roles use password `Testing@2022`):**
> - Platform Admin: `platform.admin@example.com`
> - Quality Manager: `buyer.admin@example.com`
> - Supplier: `supplier.admin@example.com`

### Step 2: Navigation — Top Bar (Mega Menu)

The top bar organises features into **7 sections**. Hover or click any section to open a dropdown panel.

```
┌─────────────────────────────────────────────────────────────────┐
│  🦅 Hawkeye  │ Quality │ Supply Chain │ Evidence │ Marketplace  │
│              │ Analytics │ EQMS │ Platform OS          [User ▼] │
└─────────────────────────────────────────────────────────────────┘
```

| Menu Section | What's Inside |
|---|---|
| **Quality** | Products, Compliance (CAPAs, Audits), Execution (Calendar, Templates) |
| **Supply Chain** | Suppliers, Engagements, Risk & Insights |
| **Evidence** | DigiLocker, Audit Trail, Workspace |
| **Marketplace** | Supplier Marketplace, Browse Products, Auditor Network |
| **Analytics** | Insights Dashboard, FDA Inspection, Reports |
| **EQMS** | Document Control, NCs, Complaints, Risk Register, Training, Management Review |
| **Platform OS** | Party Directory, CoC Tracker, Transactions, Module Config |

### Step 3: Navigation — Sidebar

The sidebar groups items by functional area. Expand each section:

- **DISCOVERY** — Insights, Supplier Risk, Product Catalog, FDA Dashboard
- **PROCUREMENT** — Request Audits, RFQs, Engagements, Qualification Cases
- **OPERATIONS** — Work Queue, Audit Summary, CAPAs, Calendar
- **ASSETS** — DigiLocker, Sites, API Library, Integrations
- **ADMIN** — Users, Notification Preferences, Settings
- **EQMS** — Document Control, NCs, Risk Register, Change Controls, Training, Management Review, Complaints
- **PLATFORM OS** — Parties, Events, CoC Tracker, Transactions, Pre-Qualification, Module Config

---

## 3. Persona: Platform Admin

**Email:** `platform.admin@example.com` | **Role:** `superadmin`

### What They Do

The Platform Admin manages the entire Hawkeye installation — creates tenants, monitors all activity, configures global settings, and has visibility across all organisations.

### Key Screens

| Screen | URL | Purpose |
|---|---|---|
| Platform Tenants | `/platform/tenants` | Create & manage tenant organisations |
| Platform Users | `/platform/users` | Global user directory |
| Audit Logs | `/platform/audit-logs` | All system events |
| Module Config | `/admin/module-config` | Enable/disable modules per tenant |
| RAG Vectors | `/admin/rag-vectors` | AI knowledge base management |
| AskHawk Admin | `/admin/askhawk` | AI assistant configuration |

### Workflow: Onboard a New Tenant

```mermaid
flowchart TB
    subgraph "Platform Admin"
        A[Login as Platform Admin] --> B[Go to /platform/tenants]
        B --> C[Click + New Tenant]
        C --> D[Fill: Name, Type: BUYER or SUPPLIER, Status: ACTIVE]
        D --> E[Tenant created]
        E --> F[Go to /platform/users]
        F --> G[Create Tenant Admin user\nassign to new tenant]
        G --> H[Set isEmailVerified = true\nvia DB or admin panel]
    end

    subgraph "New Tenant Admin"
        H --> I[Logs in at /auth/signin]
        I --> J[Goes to /admin/module-config]
        J --> K[Enables required EQMS modules]
    end

    style A fill:#7c3aed,color:#fff
    style I fill:#2563eb,color:#fff
```

### Workflow: Configure Modules for a Tenant

```mermaid
flowchart LR
    A[Go to /admin/module-config] --> B[See current module toggles]
    B --> C{Which modules needed?}
    C -->|Quality Events| D[Enable EVENT_MANAGEMENT]
    C -->|Document SOPs| E[Enable DOCUMENT_CONTROL]
    C -->|FMEA Risk| F[Enable RISK_MANAGEMENT]
    C -->|Personnel training| G[Enable TRAINING_MANAGEMENT]
    C -->|ISO 9001 reviews| H[Enable MANAGEMENT_REVIEW]
    C -->|Change requests| I[Enable CHANGE_CONTROL]
    D & E & F & G & H & I --> J[Click Save]
    J --> K[Changes apply immediately\nfor all tenant users]
```

---

## 4. Persona: Quality Manager / Tenant Admin

**Email:** `buyer.admin@example.com` | **Role:** `tenant_admin`

### What They Do

The Quality Manager is the primary EQMS operator. They own the full quality lifecycle: scheduling audits, managing NCs and CAPAs, maintaining documents, overseeing training, and running management reviews.

### Dashboard Entry Points

```
/insights          → Quality KPI overview
/audits            → All audit activity
/document-control  → SOP / policy library
/nonconformance    → Open NCs
/risk-register     → FMEA risk table
/training          → Training completion rates
/management-review → ISO 9001 clause 9.3
/complaint-manager → Customer complaints
```

### Workflow: Full EQMS Quality Cycle

```mermaid
flowchart TB
    subgraph "Document Control"
        DC1[Author creates SOP\n/document-control] --> DC2[Submit for review]
        DC2 --> DC3[Approvers sign off]
        DC3 --> DC4[Publish → EFFECTIVE]
        DC4 --> DC5[Training assigned to relevant staff]
    end

    subgraph "Quality Events"
        QE1[Event detected\nNC / Deviation / OOS] --> QE2[Log at /nonconformance]
        QE2 --> QE3[Investigate — assign root cause]
        QE3 --> QE4[Raise CAPA at /buyer/capas]
        QE4 --> QE5[Implement + verify CAPA]
        QE5 --> QE6[Close NC]
    end

    subgraph "Risk Management"
        RM1[Process risk identified] --> RM2[Log at /risk-register]
        RM2 --> RM3[Score S × O × D\nRPN auto-computed]
        RM3 --> RM4{RPN Band?}
        RM4 -->|CRITICAL ≥ 200| RM5[Immediate CAPA required]
        RM4 -->|HIGH ≥ 125| RM6[CAPA within 30 days]
        RM4 -->|MEDIUM / LOW| RM7[Monitor + mitigate]
    end

    subgraph "Management Review"
        MR1[Schedule annual review\n/management-review] --> MR2[Gather QMS inputs]
        MR2 --> MR3[Hold review meeting]
        MR3 --> MR4[Record: KPIs, decisions,\naction items, qmsAdequacy]
        MR4 --> MR5[Approve + close]
    end

    DC4 --> QE1
    QE6 --> RM1
    RM7 --> MR2

    style DC1 fill:#2563eb,color:#fff
    style QE1 fill:#dc2626,color:#fff
    style RM1 fill:#d97706,color:#fff
    style MR1 fill:#059669,color:#fff
```

---

## 5. Persona: Buyer (QA Analyst)

**Role:** `buyer`

### What They Do

The Buyer/QA Analyst manages the supply base — qualifying suppliers, requesting audits, issuing RFQs, monitoring CAPAs, and reviewing supplier risk.

### Key Screens

| Screen | URL | Purpose |
|---|---|---|
| Supplier Directory | `/buyer/suppliers` | All approved suppliers + risk scores |
| Request Audit | `/request-audit` | Initiate a new GMP audit |
| Audit Summary | `/audits` | All audits in progress and completed |
| CAPAs | `/buyer/capas` | Corrective & preventive actions |
| RFQs | `/rfqs` | Request-for-qualification workflows |
| Qualification Cases | `/qualification-cases` | Structured qualification tracking |
| Pre-Qualification | `/supplier-prequalification` | Desk review before full audit |
| Audit Calendar | `/calendar` | Scheduled audits |

### Workflow: Request a GMP Audit (Buyer Swimlane)

```mermaid
sequenceDiagram
    participant B as Buyer / QA Analyst
    participant S as Supplier
    participant A as Auditor
    participant SYS as Hawkeye System

    B->>SYS: Go to /request-audit
    B->>SYS: Select Supplier + Site + Scope
    SYS->>S: Notification: Audit requested

    Note over B,SYS: Phase: INITIATED

    B->>SYS: Send Intimation Letter artifact
    SYS->>S: Notification: Intimation received

    Note over S,SYS: Phase: PREP

    S->>SYS: Submit Pre-Audit Questionnaire
    S->>SYS: Upload DRL (Document Request List)

    Note over B,SYS: Phase: PLANNING

    B->>SYS: Confirm Scope & Agenda
    A->>SYS: Sign COI Declaration

    Note over A,SYS: Phase: EXECUTION

    A->>SYS: Complete GMP Checklist
    A->>SYS: Upload Opening Meeting Minutes
    S->>SYS: Answer Execution Questionnaire

    Note over A,SYS: Phase: FINDINGS

    A->>SYS: Log Findings
    A->>SYS: Issue Preliminary Deficiency Report

    Note over B,SYS: Phase: CAPA

    B->>SYS: Create CAPA Plan
    S->>SYS: Submit CAPA responses

    Note over A,SYS: Phase: CLOSURE

    A->>SYS: Upload Final Report
    A->>SYS: Set Facility Outcome:\nSATISFACTORY / CONDITIONALLY / UNSATISFACTORY
    SYS->>B: Audit closed — risk score updated
```

### Workflow: Supplier Risk Assessment

```mermaid
flowchart LR
    A[Go to /buyer/suppliers] --> B[Select Supplier]
    B --> C[View Risk Profile tab]
    C --> D{Risk Score}
    D -->|High Risk 🔴| E[Trigger immediate audit\n/request-audit]
    D -->|Medium Risk 🟡| F[Schedule next audit\n/calendar]
    D -->|Low Risk 🟢| G[Annual review\nno immediate action]

    E --> H[Monitor CAPA at /buyer/capas]
    F --> I[Issue RFQ at /rfqs]
    G --> J[Continue monitoring\n/insights]
```

---

## 6. Persona: Supplier

**Email:** `supplier.admin@example.com` | **Role:** `supplier`

### What They Do

The Supplier responds to audit requests, submits questionnaires, uploads evidence documents to DigiLocker, and manages their product and site listings.

### Key Screens

| Screen | URL | Purpose |
|---|---|---|
| My Risk Profile | `/supplier/risk` | Own compliance score |
| DigiLocker | `/digilocker` | Upload & manage compliance documents |
| Work Queue | `/work/questionnaires` | Assigned questionnaires to complete |
| Products | `/products` | Product catalogue management |
| Sites | `/sites` | Manufacturing site profiles |
| Engagements | `/engagements` | Active buyer engagements |
| Notifications | `/workspace/notifications` | Alerts from buyers/auditors |

### Workflow: Respond to an Audit (Supplier Swimlane)

```mermaid
sequenceDiagram
    participant S as Supplier
    participant WQ as Work Queue (/work)
    participant DL as DigiLocker
    participant AUD as Audit Detail (/audits/[id])

    Note over S: Notification received: New audit initiated

    S->>WQ: Go to /work/questionnaires
    WQ->>S: List of assigned questionnaires

    S->>WQ: Open Pre-Audit Questionnaire
    S->>WQ: Complete all sections + Submit

    Note over S: Notification: Opening meeting scheduled

    S->>AUD: Review Scope & Agenda
    S->>DL: Upload supporting documents:\n- GMP certificates\n- SOPs\n- Batch records

    Note over S: Notification: Auditor on-site / connected

    S->>WQ: Open Execution Questionnaire
    S->>WQ: Answer each question with evidence links
    S->>WQ: Submit

    Note over S: Notification: Findings issued / PDR received

    S->>AUD: Review Preliminary Deficiency Report
    S->>AUD: Respond to findings

    Note over S: Notification: CAPA plan received

    S->>WQ: Open CAPA Questionnaire
    S->>WQ: Submit corrective actions + evidence
```

### Workflow: Upload Evidence to DigiLocker

```mermaid
flowchart TB
    A[Go to /digilocker] --> B{Document type?}
    B -->|Certificate| C[Upload GMP / ISO cert]
    B -->|SOP| D[Upload procedure document]
    B -->|Batch Record| E[Upload batch documentation]
    B -->|Test Report| F[Upload CoA / analytical data]

    C & D & E & F --> G[Set expiry date if applicable]
    G --> H[Tag with relevant audit/product]
    H --> I[Document visible to linked buyer]
    I --> J[DigiLocker auto-notifies buyer\non new uploads]
```

---

## 7. Persona: Auditor

**Role:** `auditor`

### What They Do

The Auditor leads on-site and remote GMP inspections. They complete checklists, log findings, sign COI declarations, issue the Preliminary Deficiency Report, and write the Final Report.

### Key Screens

| Screen | URL | Purpose |
|---|---|---|
| My Audits | `/auditor/audits` | Assigned audit list |
| Audit Execution | `/audits/[id]` | Active audit detail |
| Audit Calendar | `/calendar` | Upcoming scheduled audits |
| RFQs (Auditor) | `/auditor/rfqs` | Incoming qualification requests |
| CAPAs (Auditor) | `/auditor/capas` | CAPAs for my audits |
| Templates | `/template-management` | Questionnaire templates |
| Test Artifacts | `/test-artifacts` | Evidence from completed audits |
| Work Queue | `/work/questionnaires` | Assigned tasks |

### Workflow: Execute a GMP Audit (Auditor Swimlane)

```mermaid
sequenceDiagram
    participant A as Auditor
    participant SYS as Hawkeye (/audits/[id])
    participant S as Supplier

    Note over A: Audit assigned — Phase: PLANNING

    A->>SYS: Review pre-audit questionnaire submitted by supplier
    A->>SYS: Upload COI Declaration (sign-off)
    A->>SYS: Confirm Scope & Agenda

    Note over A: Phase: EXECUTION begins

    A->>SYS: Upload Opening Meeting Minutes
    A->>SYS: Open GMP Checklist — complete section by section
    A->>S: Request additional evidence during audit

    loop For each finding
        A->>SYS: Log finding (title, description, severity)
        A->>SYS: Attach evidence photo / document
    end

    Note over A: Phase: FINDINGS

    A->>SYS: Review Findings Log
    A->>SYS: Issue Preliminary Deficiency Report (PDR)
    A->>S: PDR delivered at closing meeting

    Note over A: Phase: CAPA

    A->>SYS: Review supplier CAPA responses
    A->>SYS: Approve / request revision on each CAPA item

    Note over A: Phase: CLOSURE

    A->>SYS: Upload Final Report (PDF)
    A->>SYS: Set Facility Outcome:\n✅ SATISFACTORY\n⚠️ CONDITIONALLY_SATISFACTORY\n❌ UNSATISFACTORY
    SYS->>A: Audit closed + archived
```

---

## 8. Core Workflow: End-to-End GMP Audit

This swimlane shows all actors across the full 8-phase audit lifecycle.

```mermaid
flowchart TB
    subgraph BUYER ["🛒 Buyer / Quality Manager"]
        B1[Request Audit\n/request-audit]
        B2[Send Intimation Letter]
        B3[Confirm Scope & Agenda]
        B4[Create CAPA Plan]
        B5[Review Final Report]
        B6[Update Supplier Risk Score]
    end

    subgraph SUPPLIER ["🏭 Supplier"]
        S1[Receive notification]
        S2[Submit Pre-Audit Questionnaire]
        S3[Upload DRL documents]
        S4[Answer Execution Questionnaire]
        S5[Review PDR findings]
        S6[Submit CAPA responses]
    end

    subgraph AUDITOR ["🔍 Auditor"]
        A1[Accept RFQ]
        A2[Sign COI Declaration]
        A3[Complete GMP Checklist]
        A4[Upload Opening Meeting Minutes]
        A5[Log findings]
        A6[Issue Preliminary Deficiency Report]
        A7[Upload Final Report]
        A8[Set Facility Outcome]
    end

    subgraph SYSTEM ["⚙️ Hawkeye System"]
        P1[Phase: INITIATED]
        P2[Phase: PREP]
        P3[Phase: PLANNING]
        P4[Phase: EXECUTION]
        P5[Phase: FINDINGS]
        P6[Phase: CAPA]
        P7[Phase: CLOSURE]
        P8[Phase: SURVEILLANCE]
    end

    B1 --> P1 --> S1 --> B2 --> P2
    P2 --> S2 --> S3 --> A1 --> B3
    B3 --> P3 --> A2 --> P4
    P4 --> A3 --> A4 --> S4 --> A5
    A5 --> P5 --> A6 --> S5
    S5 --> P6 --> B4 --> S6
    S6 --> P7 --> A7 --> A8 --> B5
    B5 --> B6 --> P8
```

---

## 9. Core Workflow: EQMS — Nonconformance to CAPA Closure

```mermaid
flowchart TB
    subgraph QM ["📋 Quality Manager"]
        QM1[Detects deviation or OOS event]
        QM2[Logs NC at /nonconformance\ntitle, type, severity]
        QM3[Assigns investigator]
        QM8[Approves CAPA plan]
        QM9[Verifies effectiveness]
        QM10[Closes NC record]
    end

    subgraph INV ["🔬 Investigator"]
        INV1[Opens NC from work queue]
        INV2[Conducts investigation\nroot cause analysis]
        INV3[Writes investigation summary]
        INV4[Proposes CAPA actions]
        INV5[Executes CAPA]
        INV6[Collects effectiveness evidence]
    end

    subgraph SYS ["⚙️ System"]
        ST1["Status: OPEN 🔴"]
        ST2["Status: UNDER_INVESTIGATION 🟡"]
        ST3["Status: PENDING_CAPA 🟡"]
        ST4["Status: CAPA_IN_PROGRESS 🔵"]
        ST5["Status: PENDING_CLOSURE 🔵"]
        ST6["Status: CLOSED ✅"]
    end

    QM1 --> QM2 --> ST1 --> QM3 --> INV1
    INV1 --> INV2 --> INV3 --> ST2
    INV3 --> INV4 --> ST3 --> QM8
    QM8 --> ST4 --> INV5 --> INV6
    INV6 --> ST5 --> QM9 --> QM10 --> ST6
```

### Severity Classification

```mermaid
graph LR
    A{NC Severity} -->|Affects patient safety\nor regulatory compliance| B["🔴 CRITICAL\nImmediate escalation\nCEO + Regulator notified"]
    A -->|Significant GMP breach| C["🟠 MAJOR\nCAPA within 15 days"]
    A -->|Minor procedural gap| D["🟡 MINOR\nCAPA within 30 days"]
    A -->|Observation only| E["⚪ INFORMATIONAL\nMonitor, no CAPA required"]

    style B fill:#dc2626,color:#fff
    style C fill:#d97706,color:#fff
    style D fill:#ca8a04,color:#fff
    style E fill:#6b7280,color:#fff
```

---

## 10. Core Workflow: Document Control Lifecycle

```mermaid
flowchart TB
    subgraph AUTHOR ["✍️ Document Author"]
        DA1[Create new document\n/document-control → + New Document]
        DA2[Set: Title, Type SOP/POLICY/WI,\nVersion 1.0, Owner]
        DA3[Draft content / upload file]
        DA4[Submit for review]
    end

    subgraph REVIEWER ["👀 Reviewer"]
        REV1[Receives review notification]
        REV2[Review document content]
        REV3{Decision}
        REV4[Request changes → back to DRAFT]
        REV5[Approve step]
    end

    subgraph QM ["📋 Quality Manager"]
        QM1[All approvals received]
        QM2[Click Publish → EFFECTIVE]
        QM3[Set effective date]
        QM4[Assign training if required]
        QM5[Supersede old version]
    end

    subgraph SYS ["⚙️ Status"]
        S1["DRAFT"]
        S2["UNDER_REVIEW"]
        S3["APPROVED"]
        S4["EFFECTIVE ✅"]
        S5["SUPERSEDED"]
        S6["WITHDRAWN"]
    end

    DA1 --> DA2 --> DA3 --> S1 --> DA4
    DA4 --> S2 --> REV1 --> REV2 --> REV3
    REV3 -->|Rejected| REV4 --> S1
    REV3 -->|Approved| REV5 --> S3 --> QM1
    QM1 --> QM2 --> S4 --> QM3 --> QM4
    QM4 -->|New version needed| QM5 --> S5
    QM2 -->|Emergency withdrawal| S6
```

### Document Versioning

```
Major version bump  →  New document content (SOP revised)
Minor version bump  →  Minor corrections, formatting
DOC-2026-0001 v1.0  →  DOC-2026-0001 v1.1  →  DOC-2026-0001 v2.0
                                                     ↑
                                              supersedes v1.x
```

---

## 11. Core Workflow: Supplier Qualification Journey

```mermaid
flowchart TB
    subgraph BUYER ["🛒 Quality Manager / Buyer"]
        B1[New supplier identified]
        B2[Create Pre-Qualification record\n/supplier-prequalification]
        B3[Complete desk review checklist]
        B4{Desk review outcome}
        B5[Approve PQ → APPROVED]
        B6[Conditional approval + conditions list]
        B7[Reject → REJECTED]
        B8[Initiate full GMP Audit\n/request-audit]
        B9[Post-audit qualification decision]
        B10[Onboard supplier\n/onboard]
    end

    subgraph SUPPLIER ["🏭 Supplier"]
        S1[Submits profile + documents]
        S2[Responds to desk review queries]
        S3[Participates in GMP audit]
        S4[Responds to CAPA findings]
        S5[Approved supplier — active on platform]
    end

    subgraph SYS ["⚙️ PQ Status"]
        PQ1["DRAFT"]
        PQ2["SUBMITTED"]
        PQ3["UNDER_REVIEW"]
        PQ4["APPROVED ✅"]
        PQ4B["CONDITIONALLY_APPROVED ⚠️"]
        PQ5["REJECTED ❌"]
    end

    B1 --> B2 --> PQ1 --> B3 --> PQ2
    PQ2 --> S1 --> S2 --> PQ3 --> B4
    B4 -->|Pass| B5 --> PQ4 --> B8
    B4 -->|Conditional| B6 --> PQ4B --> B8
    B4 -->|Fail| B7 --> PQ5
    B8 --> S3 --> B9 --> S4
    S4 --> B10 --> S5

    style PQ4 fill:#059669,color:#fff
    style PQ4B fill:#d97706,color:#fff
    style PQ5 fill:#dc2626,color:#fff
```

---

## 12. Core Workflow: Complaint Management

```mermaid
flowchart TB
    subgraph INPUT ["📥 Complaint Intake"]
        I1[Complaint received\nCustomer / Patient / Regulator / Field]
        I2[Log at /complaint-manager\n+ Log Complaint]
        I3[Classify:\nType: PRODUCT_QUALITY / SAFETY / LABELING...\nSeverity: CRITICAL / MAJOR / MINOR]
        I4{Requires MDR?}
        I5[Flag: isMedicalDeviceReport = true\nRegulatory reporting clock starts]
    end

    subgraph INVESTIGATION ["🔬 Investigation"]
        INV1[Assign to investigator]
        INV2[Review batch/lot, product records]
        INV3[Identify root cause]
        INV4[Link to CAPA if needed]
        INV5[Link to NC if batch-wide issue]
    end

    subgraph CLOSURE ["✅ Closure"]
        C1[CAPA implemented + verified]
        C2[Draft customer response]
        C3[Quality Manager approves closure]
        C4[Complaint closed]
        C5[Regulatory report submitted if required]
    end

    subgraph SYS ["⚙️ Status Flow"]
        ST1["OPEN 🔴"]
        ST2["UNDER_INVESTIGATION 🟡"]
        ST3["PENDING_CAPA 🟡"]
        ST4["CAPA_IN_PROGRESS 🔵"]
        ST5["PENDING_CLOSURE 🔵"]
        ST6["CLOSED ✅"]
    end

    I1 --> I2 --> I3 --> ST1 --> I4
    I4 -->|Yes| I5 --> INV1
    I4 -->|No| INV1
    INV1 --> ST2 --> INV2 --> INV3 --> INV4 --> INV5
    INV5 --> ST3 --> C1 --> ST4
    C1 --> ST5 --> C2 --> C3 --> C4 --> ST6
    C4 -->|MDR flagged| C5

    style ST6 fill:#059669,color:#fff
    style ST1 fill:#dc2626,color:#fff
    style I5 fill:#7c3aed,color:#fff
```

---

## 13. Core Workflow: Management Review Cycle

The Management Review fulfils **ISO 9001:2015 Clause 9.3** — top management reviews the QMS for suitability, adequacy, and effectiveness.

```mermaid
flowchart LR
    subgraph PLAN ["📅 Plan (1-4 weeks before)"]
        P1[Schedule review\n/management-review → + Schedule Review]
        P2[Set type: ANNUAL / QUARTERLY / AD_HOC]
        P3[Assign chair + attendees]
        P4[Define review period]
    end

    subgraph INPUT ["📊 Gather QMS Inputs"]
        IN1[Audit results summary]
        IN2[CAPA effectiveness data]
        IN3[Customer feedback + complaints]
        IN4[Process performance KPIs]
        IN5[NC trends]
        IN6[Previous action item status]
        IN7[Training completion rates]
        IN8[Risk register update]
    end

    subgraph MEETING ["🤝 Review Meeting"]
        M1[Status → IN_PROGRESS]
        M2[Present each QMS input]
        M3[Discuss performance gaps]
        M4[Record decisions]
        M5[Agree improvement opportunities]
        M6[Assign action items with owners + due dates]
    end

    subgraph OUTPUT ["📋 Outputs"]
        O1[Record qmsAdequacy:\nADEQUATE / NEEDS_IMPROVEMENT / INADEQUATE]
        O2[Resource decisions documented]
        O3[Action items tracked in system]
        O4[Status → COMPLETED ✅]
        O5[Upload meeting minutes document]
    end

    PLAN --> INPUT --> MEETING --> OUTPUT

    style O4 fill:#059669,color:#fff
```

### QMS Adequacy Outcomes

| Outcome | Meaning | Next Steps |
|---|---|---|
| ✅ **ADEQUATE** | QMS is functioning effectively | Continue current approach, minor improvements |
| ⚠️ **NEEDS IMPROVEMENT** | Gaps identified, action required | Action items assigned, tracked to closure |
| ❌ **INADEQUATE** | Systemic failures, urgent remediation | Immediate corrective program, potential regulatory notification |

---

## 14. Quick Reference — All URLs by Role

### Platform Admin

```
/platform/tenants          Manage tenant organisations
/platform/users            Global user directory
/platform/audit-logs       System audit trail
/admin/module-config       Enable/disable modules
/admin/rag-vectors         AI knowledge base
/admin/askhawk             AskHawk AI config
/insights                  Analytics overview
```

### Quality Manager / Tenant Admin

```
/admin/module-config       Enable EQMS modules first!
/audits                    All audits
/document-control          SOP / policy lifecycle
/nonconformance            NC tracker
/complaint-manager         Complaint tracker
/risk-register             FMEA risk table
/change-controls           Change control requests
/training                  Training assignments
/management-review         ISO 9001 §9.3 reviews
/supplier-prequalification Desk review records
/buyer/capas               CAPA management
/qualification-cases       Qualification tracking
/insights                  QMS performance KPIs
```

### Buyer / QA Analyst

```
/buyer/suppliers           Supplier directory + risk
/request-audit             Initiate new audit
/audits                    Audit pipeline
/buyer/capas               CAPAs
/rfqs                      RFQ management
/qualification-cases       Qualification cases
/calendar                  Audit calendar
/engagements               Supplier engagements
/digilocker                Evidence vault
/nonconformance            NCs (if module enabled)
```

### Supplier

```
/supplier/risk             Own compliance score
/work/questionnaires       Assigned questionnaires
/digilocker                Document uploads
/products                  Product listings
/sites                     Site profiles
/engagements               Active engagements
/workspace/notifications   Alerts & tasks
/supplier/api-library      API master catalog
```

### Auditor

```
/auditor/audits            Assigned audits
/audits/[id]               Execute active audit
/auditor/rfqs              Incoming RFQs
/auditor/capas             My CAPAs
/calendar                  Schedule
/template-management       Questionnaire templates
/test-artifacts            Audit evidence
/work/questionnaires       Task queue
```

---

## Tips & Troubleshooting

### Can't see EQMS menu items?
→ Modules are OFF by default. Go to `/admin/module-config` and enable them. You need `tenant_admin` or `superadmin` role.

### Getting "module not enabled" on an EQMS page?
→ The specific module for that page is disabled. Enable it at `/admin/module-config`.

### Empty list on any EQMS page?
→ No records exist yet. Use the `+` button on each page to create the first record.

### Login fails with "Invalid credentials"?
→ Check that the password stored in the DB is bcrypt-hashed (starts with `$2b$`). If stored as plain text, run the password migration script.

### Login fails with "Email not verified"?
→ Set `isEmailVerified: true` for the user in MongoDB directly, or use the admin user management panel.
