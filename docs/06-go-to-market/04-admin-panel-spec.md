# Admin Panel — Detailed Spec

> What every Hawkeye tenant needs to control. Designed once, used by every customer.
> Owner: founder + product · Last updated: 2026-04-26 · Status: spec (not yet built)

This spec defines **the Tenant Admin and Org Admin panels** — the surfaces that tenant administrators (customer side) and Hawkeye internal staff (Hawkeye side) use to configure, govern, audit, and bill the platform.

It is the doc that engineering implements against, the doc that IT teams ask for during procurement, and the doc that the SaaS pricing page links to.

---

## 1. Two panels, two audiences

| Panel | Lives at | Audience | Scope |
|---|---|---|---|
| **Tenant Admin** | `/admin` (in customer-facing app) | Customer's tenant_admin role | Their own tenant only |
| **Org Admin** (Hawkeye internal) | `/internal/admin` (separate subdomain, IP-restricted) | Hawkeye staff with `org_admin` role | All tenants, billing, support tooling |

This doc covers both. Tenant Admin is the bigger surface and ships first.

---

## 2. Tenant Admin — the 9 sections

Every tenant_admin user lands on `/admin` and sees these 9 sections in left-nav order.

### 2.1 Overview / Health
The default landing screen. Read-only.

- **Subscription tier** (engine + which packs · billing period · renewal date)
- **Active users** (count by role + active in last 7 days)
- **Storage used** (% of quota — files, audit reports, evidence)
- **AI agent usage this period** (calls + tokens + $ if metered)
- **Open SLA breaches** (red number — overdue CAPA, overdue audits, overdue training)
- **Recent activity** (last 20 audit-trail events in tenant)
- **Compliance posture** (rolling % of "best-practice flags satisfied" — e.g., e-sig configured, MFA enforced, retention policy set)

### 2.2 Users & Roles
- **User table** — email · firstName/lastName · role · adminScope · status · last login · MFA enrolled.
- **Bulk actions** — invite via CSV upload, deactivate, force password reset, force MFA enroll.
- **Role definitions** (read-only — defined per industry pack):
  - `buyer` · `buyer_admin` · `tenant_admin` (org-wide)
  - `auditor` · `auditor_lead` · `auditor_reviewer`
  - `supplier` · `supplier_user` · `supplier_admin`
  - `qa_specialist` · `qa_head` · `vp_quality`
  - + vertical-specific: `production_head`, `qc_lab`, `regulatory`, `doc_control`, `training_coord`, `maintenance` (pharma); `ppap_lead`, `apqp_lead` (auto); etc.
- **Custom-role builder** *(advanced; tenant_admin)*: pick base role + override permissions. Generates a `role.permissions[]` array stored on User.
- **SCIM/SAML provisioning** (Phase 2) — auto-sync users from customer's IdP.

### 2.3 RBAC / Permissions Matrix
A grid that every tenant_admin can read and edit (within bounds Hawkeye allows).

- **Rows** = modules (Audit, CAPA, Deviation, etc.) + sub-resources (e.g., for Audit: read · create · transition · close · sign).
- **Columns** = roles (the 12-15 roles listed above).
- **Cells** = `Allow / Deny / Inherit`.
- **Diff against industry pack default** is shown — green if matches default, yellow if customized.
- **Audit log** — every cell change is logged with who/when/why-comment-required.

A worked example (pharma):
```
                 buyer  buyer_admin  auditor  auditor_lead  supplier  vp_quality
Audit · read     ✓      ✓            ✓        ✓             read-own  ✓
Audit · create   ✓      ✓            -        -             -         ✓
Audit · close    -      ✓            -        ✓             -         ✓
Audit · sign     -      ✓            ✓        ✓             ✓         ✓
CAPA · approve   -      ✓            -        ✓             -         ✓
```

### 2.4 Modules & Vocabulary
- **Module gating table** — 15 modules × `enabled / disabled / readonly`.
- **Industry pack picker** — which packs are licensed (pharma · med-device · ISO 9001 · etc.) — visible but not modifiable by tenant_admin (sales-controlled).
- **Vocabulary overrides** — 9 terms editable per pack:
  - audit (default per pack: "GMP Audit" / "QMS Audit" / "Quality Audit")
  - finding (default: "Deficiency" / "Nonconformance" / "Nonconformity")
  - capa (default: "CAPA" / "8D" for auto)
  - report · supplier · buyer · auditor · product · site
- **Preview** — live preview of the UI strings as they'll appear to users.

### 2.5 Workflow & SLA Configuration
- **Workflow definition library** — list of WorkflowDefinitions (built-in + custom). Tenant_admin can clone built-in → customize.
- **Phase rules editor** — for each workflow, edit prerequisites for phase transitions.
- **SLA configuration** — per workflow, per audit type:
  - `defaultDueDays` (e.g., CAPA NEEDS_SUPPLIER → 30 days target)
  - `escalationRules[]` (after X hours past due → notify roles Y → severity Z)
  - **Notification channels** (email · in-app · webhook · Slack · Teams)
- **Force-bypass log** — every time admin uses `force: true` to skip a phase prerequisite, recorded for compliance.

### 2.6 AI Agents & Permissions ⭐ *new — see Doc 5 for full spec*

The single most important section for AI ROI tracking and governance.

- **Agent catalog** — all 12+ agents with status (enabled / disabled / beta).
  - Per agent: provider (Gemini · Claude · on-prem Llama), prompt version, last-30d call count, $ cost.
- **Per-role agent permissions matrix** — which roles can invoke which agents.
- **Per-user / per-role quota** — daily / monthly cap on agent calls.
- **Quota enforcement mode** — `hard` (block at limit) / `soft` (warn) / `unlimited`.
- **Cost cap** — monthly $ ceiling per tenant; alert at 70%, 90%, 100%.
- **Audit log** — every agent call recorded: who · when · which agent · prompt-hash · cost · outcome.
- **PII scrubbing settings** (for hybrid/on-prem deployments) — enable/disable + dictionary upload.
- **Provider-key management** — tenant can BYO Gemini/Anthropic API key (lower per-call cost, customer pays directly).

### 2.7 Compliance & Governance
- **Electronic Signatures (21 CFR Part 11) settings**:
  - Enforce mode: `hard` (block transitions without e-sig) / `soft` (log warning) / `off`.
  - Per-record-type enforcement (deviation closure must be signed; document approvals must be signed; etc.).
  - Signature meaning catalog (`APPROVED`, `REVIEWED`, `WITNESSED`, `RESPONSIBLE_FOR_CONTENT`).
- **Audit Trail viewer** — searchable log across all collections (who · when · what · old/new value · IP · user-agent).
- **Retention policies** — per record type: keep N years then archive (write to S3 Glacier) or purge.
- **Data residency** — show which region the tenant data lives in.
- **DPA / SCC / BAA** — links to active legal agreements + version + signed date.
- **Compliance certifications** — show Hawkeye's SOC 2 / ISO 27001 / GxP attestations + download.

### 2.8 Integrations
- **API keys** — tenant can mint API keys with scoped permissions for ETL / external systems.
- **Webhook endpoints** — register URLs to receive event notifications (audit-trail events, status changes, AI agent results).
- **Outbound integrations**:
  - Slack / Teams (notifications)
  - DocuSign (e-sig fallback)
  - Jira / ServiceNow (incident escalation)
  - SAP / Oracle / Coupa (supplier master sync)
  - MasterControl / Veeva Vault QMS (bidirectional connector — see Doc 1 partner play)
- **Inbound integrations**:
  - SCIM (user provisioning)
  - SAML / OIDC (SSO)
  - Public regulatory feeds (openFDA, EMA EudraGMDP, WHO PQ — pre-configured)

### 2.9 Subscription & Billing
- **Plan summary** — engine tier · packs licensed · seat count.
- **Usage this period** — seats used / quota · AI agent calls / quota · marketplace transactions / quota.
- **Invoice history** — downloadable PDFs.
- **Add-ons** — buy more seats · buy a vertical pack · buy on-prem add-on.
- **Cost projection** — AI usage + marketplace fees projected to month-end.

---

## 3. Org Admin (Hawkeye internal) — the 6 sections

Lives at `internal-admin.hawkeye.app` (separate subdomain, IP-restricted to Hawkeye office + VPN, MFA + hardware-key required).

### 3.1 Tenants
- **Tenant table** — all tenants · type (BUYER / SUPPLIER / AUDITOR / mixed) · industry pack · plan · MRR · status · created · last activity.
- **Per-tenant detail** — drilldown to user table, recent audit trail, support tickets, infra tier.
- **Impersonate** — one-click "log in as tenant_admin of tenant X" (heavily logged).
- **Provision new tenant** — wizard: name · industry pack · seat allotment · contract terms.
- **Suspend / unsuspend** — billing-failure path.

### 3.2 Industry Packs
- **Pack catalog** — all packs (pharma · med-device · ISO 9001 · food · auto · custom) with version + change log.
- **Pack editor** (engineering only):
  - Standards library (citations).
  - Module template (which modules on/off).
  - Vocabulary defaults.
  - AI prompt library (per agent, per pack).
  - Marketplace seed data.
- **Per-tenant pack assignment** — assign packs to tenants from the catalog.
- **Pack version pinning** — let some tenants stay on pack v1.4 while others move to v1.5.

### 3.3 AI Operations
- **Provider dashboard** — daily $ spend per provider (Gemini · Claude · on-prem) with cost per 1k calls.
- **Agent performance** — per agent: success rate · avg latency · avg confidence · token cost.
- **Prompt-version audit** — view prompts in production · compare versions · roll back.
- **Token cost recovery** — for tenants on metered plans, the actual cost ÷ billable cost = margin per agent.
- **Quota override** — for support escalations.
- **Feature flags** — turn agents on/off per tenant.

### 3.4 Marketplace Operations
- **Supplier directory** — all supplier profiles, public + onboarded.
- **Audit-report library** — all reports licensed for marketplace, with view counts + revenue.
- **Auditor pool** — all auditor affiliations · COI declarations · qualification status.
- **Transaction log** — every shared-audit purchase · auditor commission booked · supplier listing fee paid.
- **Moderation** — flag inappropriate supplier listings · resolve disputes.

### 3.5 Compliance & Audit (Hawkeye-side)
- **Audit-log search across all tenants** (legal/security request fulfillment).
- **DSR / GDPR right-to-erasure** — execute "delete user X data across the platform" workflow.
- **Pen-test reports** — current.
- **SOC 2 / ISO 27001 / HIPAA evidence** — readiness dashboard.
- **Security incidents** — log + post-mortems + customer-comm templates.

### 3.6 Billing
- **Stripe / billing-provider dashboard** mirror.
- **MRR · ARR · churn** by tenant + by pack.
- **Per-tenant usage rollup → invoice** workflow.
- **Refunds + credits** workflow.
- **Tax / currency / per-region pricing**.

---

## 4. Data model — what backs the panels

A short list of new collections needed (most exist; a few new ones):

| Collection | New? | Purpose |
|---|---|---|
| `users` | exists | with new field `customRolePermissions[]` |
| `tenants` | exists | with new field `industryPackVersion` and `complianceClaims[]` |
| `module-configs` | exists | already supports vocabulary + module gating |
| `workflow-definitions` | exists | tenant-customizable |
| `workflow-sla-configs` | exists | tenant-customizable |
| **`agent-permissions`** | **NEW** | per-tenant: roleId → agentKey → allowed/quota |
| **`agent-usage-events`** | **NEW** | per-call: tenant · user · agent · tokens · $ · outcome |
| **`tenant-quotas`** | **NEW** | seats / storage / AI calls / marketplace tx — current vs limit |
| **`compliance-settings`** | **NEW** | per tenant: e-sig mode · retention · region |
| `audit-trails` | exists | already universal — add Admin-Panel writes |
| **`integration-keys`** | **NEW** | API keys + webhook endpoints + scopes |
| **`subscription-plans`** | **NEW** | tenant plan + add-ons + billing terms |
| **`tenant-billing-events`** | **NEW** | invoice, payment, refund |

The two starred-most-important: `agent-permissions` and `agent-usage-events` — see Doc 5.

---

## 5. UX principles for the Admin Panel

- **One panel, not 12 microsites.** Left-nav with 9 sections, top-bar shows tenant identity + impersonation banner if Hawkeye staff.
- **Every change is audit-logged.** No exceptions. Required reason on destructive changes.
- **Defaults from the industry pack**, never blank. Tenant_admin sees "default for pharma pack" next to every setting.
- **Diff visualization** — yellow when customized, green when default — makes it easy to see "what did we change."
- **Read-only by default for sales-controlled fields** (industry pack assignment, plan tier). Tenant_admin sees them but can't edit; "request change" routes to Hawkeye.
- **Mobile-okay, desktop-first.** Admins live in laptops; mobile is for emergency lookups.

---

## 6. Build phases

| Phase | Scope | Effort |
|---|---|---|
| **Phase 1** (Q3 2026) | Tenant Admin sections 2.1, 2.2, 2.4, 2.6, 2.7, 2.9 (Overview, Users, Modules+Vocab, AI, Compliance, Subscription) | 6-8 weeks |
| **Phase 2** (Q4 2026) | Tenant Admin sections 2.3, 2.5, 2.8 (RBAC matrix, Workflow+SLA editor, Integrations) | 4-6 weeks |
| **Phase 3** (Q4 2026) | Org Admin sections 3.1, 3.3, 3.4 (Tenants, AI Ops, Marketplace Ops) | 4-6 weeks |
| **Phase 4** (Q1 2027) | Org Admin sections 3.2, 3.5, 3.6 (Pack Editor, Compliance, Billing) | 6-8 weeks |
| **Phase 5** (ongoing) | SCIM · SAML · custom-role-builder · advanced webhooks | rolling |

Total: ~20-28 engineer-weeks for Tenant Admin + Org Admin v1.

---

## 7. The "what does the Admin Panel let me do that competitors don't" pitch

For your sales conversations:

| Competitor | Their admin panel | Hawkeye delta |
|---|---|---|
| MasterControl | Per-module config + RBAC (deep but rigid; requires services to change) | **Tenant_admin self-serve** for vocab + module + RBAC + workflow customization |
| Veeva Vault QMS | Vault Admin Console (powerful but Vault-shaped; per-Vault config) | **One panel** spans EQMS + Marketplace + AI + Audits |
| Dot Compliance / ComplianceQuest | Salesforce-native admin (every change touches Salesforce setup) | **No Salesforce tax** — admin runs on our app, not on a platform |
| Qualifyze | Limited — you log in, you book audits, no admin surface | **Real platform admin** — workflows, RBAC, AI quotas, all configurable |
| Qualio / Greenlight Guru | Simple admin, weak RBAC | **Industrial-strength RBAC + AI permission matrix** |

The single line for the deck:
> *"The only EQMS admin panel that lets you govern AI agent usage, set per-role token quotas, and customize workflows without a services engagement."*
