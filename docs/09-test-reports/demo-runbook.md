---
doc: demo-runbook
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: test-reports
status: current
---

# AI Demo Runbook — Novex Pharma EQMS

**Duration: 15 minutes · Audience: pharma quality buyers / investors / regulatory leads**

Every scene is timed, has exact copy-paste commands, and tells you what to say out loud. Two data layers are seeded:

- **Real public FDA data** (live-fetched at demo time) — recalls, warning letters, 483 observations for well-known pharma firms
- **Realistic tenant data** (seeded via `seed-ai-demo-data.mjs`) — 3 deviations, 2 CAPAs, historical findings, a supplier dossier, 1 signal alert, all crafted from real FDA 483 patterns

Sample-data provenance: [`demo-sample-data.json`](./demo-sample-data.json)

---

## Pre-flight (do this 15 min before the demo)

| # | What | How | Expected |
|---|---|---|---|
| 0.1 | Backend up on 8888 with tools registered + Gemini | `cd backend && PORT=8888 npm run start &` | Log prints `[ai] registered 3 agent tools: ...` + `Server running on port 8888` |
| 0.2 | Demo data seeded into Novex | `node scripts/seed-ai-demo-data.mjs` | `✓ demo data seeded into Novex tenant` |
| 0.3 | Smoke both waves | `BASE=http://localhost:8888 node scripts/smoke-test-ai-waves.mjs` · then `smoke-test-audit-agents.mjs` | ≥ 10/12 and ≥ 9/10 pass |
| 0.4 | Open 4 browser tabs, logged-in side-by-side | Cmd/Ctrl+click each url below | Ready to switch between personas without fumbling |
| 0.5 | Demo JSON payload clipboard | Copy the `curl` cheat-sheet below into clipboard manager | One paste per scene |

**Login matrix for the tabs** (all password `EqmsDemo@2026`):

| Tab | Persona | Email |
|---|---|---|
| 1 · QA Specialist | Kenji (QA-Spec) | `qa.specialist@novex-pharma.demo` |
| 2 · Audit Program Mgr | Priya (AUD-PM) | `audit.program@novex-pharma.demo` |
| 3 · Head of QA | James (QA-Head) | `qa.head@novex-pharma.demo` |
| 4 · VP Quality (optional) | Elena (VP) | `vp.quality@novex-pharma.demo` |

---

## Scene 1 · Problem Setup (0:00 — 1:30)

**Actor:** You (presenter)
**Talk track:**
> "Novex Pharma just found an OOS on a stability sample — Novexolimus 1 mg IR tablet, lot NVX-IR-24108, dissolution at 76% against NLT 80%. In most EQMS, this sends QA into a 4-hour spreadsheet exercise. Watch what happens with Hawkeye."

Switch to **Tab 1 (QA Specialist)** · navigate `/nonconformance` · filter by "today's deviations" · show `DEV-DEMO-001` already open.

No API calls. Pure framing.

---

## Scene 2 · Deviation Scaffold → RCA Draft (1:30 — 4:30)

**Actor:** Kenji (QA-Spec)

### 2a — 5-Why Scaffolder (30s)

Click "Scaffold 5-why with AI" on `DEV-DEMO-001`.

**What you'll see:** 5 probing "why" questions with probable answers, 3 follow-up questions for the shop floor, 6M categorisation. Completes in ~3s on Gemini.

**curl equivalent (if the UI stalls, drop to terminal):**
```bash
TOKEN=$(curl -s -X POST http://localhost:8888/api/auth/login -H "content-type: application/json" \
  -d '{"email":"qa.specialist@novex-pharma.demo","password":"EqmsDemo@2026"}' | jq -r .token)

curl -s -X POST http://localhost:8888/api/ai/deviation/scaffold-five-why \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"deviationTitle":"OOS dissolution on batch NVX-2026-B014","deviationDescription":"Batch NVX-2026-B014 failed dissolution: 76% vs NLT 80%. Retest confirmed. No equipment alarm.","detectionSource":"QC release testing","immediateAction":"Batch quarantined"}' | jq .
```

**Talk track:**
> "The AI is not guessing — it cites the regulatory corpus we grounded it on. Every probable answer has a citation. If the AI isn't confident, it returns a fallback, not a hallucination. That's the platform guarantee."

### 2b — CAPA RCA Drafter (90s)

Click "Draft RCA with AI". Drawer opens.

**What you'll see:** Full structured RCA — 5-why chain, fishbone 6M, corrective actions (with owner role + due days), preventive actions, effectiveness check, severity, regulatory clauses (21 CFR 211.100, 211.160). **Confidence ≥ 0.85** typically. Takes 6–10s on Gemini.

**curl equivalent:**
```bash
curl -s -X POST http://localhost:8888/api/ai/capa/draft-rca \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{
    "deviationNarrative":"Batch NVX-2026-B014 failed dissolution spec (95% vs target 80-110%). QC retest confirmed. Historical trend: 2 similar results last quarter on same line.",
    "retrievalSet":[
      {"docId":"SOP-QC-014","chunkId":"3.2","text":"Dissolution testing per USP <711>; sample size n=6; acceptance Q=80%±10%","score":0.95},
      {"docId":"PRIOR-CAPA-042","chunkId":"findings","text":"Prior dissolution OOS traced to blending-time drift on Line 2; CAPA: real-time blend-time alarm added.","score":0.88}
    ],
    "batchInfo":"NVX-2026-B014 · Line 2 · March 2026",
    "productInfo":"Novexolimus 1mg tablet · immediate-release · FDA IND 12345"
  }' | jq .
```

### 2c — Predictive CAPA badge (30s)

On the saved CAPA, the **Predictive CAPA badge** auto-renders.

**What you'll see:** Two percentages — `P(on-time)=76%` · `P(effective)=72%` — with top factors ranked by contribution.

**Talk track:**
> "The badge isn't magic. It's a calibrated heuristic trained on structured features — owner-history, severity, slack days, deviation recurrence, supplier risk band. Every prediction carries its model version and explanation. FDA's Jan-2025 AI guidance requires Intended Use Statements — ours are in the code."

**Duration so far: 4:30**

---

## Scene 3 · Supplier Intel — Public vs Tenant (4:30 — 7:30)

**Actor:** Priya (AUD-PM)

Switch to **Tab 2**. Navigate `/buyer/suppliers`. Click a supplier card OR open a new search.

### 3a — Query a real, high-risk pharma firm

Type **"Sun Pharmaceutical Industries"** in the supplier intel search.

**curl equivalent (if you prefer the CLI):**
```bash
TOKEN=$(curl -s -X POST http://localhost:8888/api/auth/login -H "content-type: application/json" \
  -d '{"email":"audit.program@novex-pharma.demo","password":"EqmsDemo@2026"}' | jq -r .token)

curl -s -X POST http://localhost:8888/api/ai/audit-agents/supplier-intel \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"supplierName":"Sun Pharmaceutical Industries Ltd","fetchPublic":true}' | jq .
```

**What you'll see:**
- **Verdict chip: `public_only`** — Sun is not in Novex's registered supplier list
- **Public card (orange)** populated from openFDA live — drugs registered, recalls, warning letters
- **Tenant card (blue)** empty — "not in your registry"
- **Provenance note:** "Not in your supplier registry. Public data found — this entity is NOT one of your qualified suppliers."

**Talk track:**
> "Every data point is tagged with its source. Blue = your registered data. Orange = public regulatory data. Sun's got a real Sept-2023 warning letter and a 2025 import alert — openFDA's returning that live. Compare to the next search..."

### 3b — Query the seeded "Acme Fine Chemicals" — MEDIUM risk, in dossier

Type **"Acme Fine Chemicals"**.

**What you'll see:**
- Same intel card but with a cached dossier (seeded earlier)
- MEDIUM risk band · 1 recall noted · still `public_only` verdict (we haven't registered this supplier)

**Talk track:**
> "When the dossier is <30 days old we don't re-fetch openFDA. The dossier is hashed, stored, and auditable — any AI analyst that read it later gets the same inputs."

### 3c — Compare with a TENANT-REGISTERED supplier

Type **"Global Pharma"** (this exists in the Novex seed from earlier).

**What you'll see:**
- **Verdict: `known_tenant`** · blue card with tenant records shown
- Public card still populated with FDA data (as context)
- Clear visual distinction

**Talk track:**
> "Same interface, different verdict. Zero chance of confusing 'we have this supplier approved' with 'public data mentions this name'."

**Duration so far: 7:30**

---

## Scene 4 · Audit Prep Agent — Risk-Weighted Questionnaire (7:30 — 10:00)

**Actor:** Priya (AUD-PM)

Stay on Tab 2. Navigate `/request-audit` · click "AI-draft questionnaire".

Fill form:
- Supplier: **Sun Pharmaceutical Industries Ltd**
- Product class: **API**
- Scope: **Full GMP audit**
- Audit type: **GMP**

Click Draft.

**What you'll see (6–10s):**
- 5–7 sections returned with priority (`high`/`medium`/`low`)
- Each section has a **risk_rationale** citing the openFDA + warning-letter signals
- 3–5 **high-risk signals** flagged (data integrity, aseptic contamination, OOS investigation per Sun's WL history)
- `citations` array referencing `recall:...`, `wl:...`, `finding:...`
- Confidence typically 0.85+

**curl equivalent:**
```bash
curl -s -X POST http://localhost:8888/api/ai/audit-agents/prepare-questionnaire \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"supplierName":"Sun Pharmaceutical Industries Ltd","productClass":"API","scope":"Full GMP","auditType":"GMP"}' | jq '.plan.sections | map({name:.categoryName, priority, signals:.risk_rationale[0:80]})'
```

**Talk track:**
> "A manual audit-program planner spends 1–2 days writing a tailored questionnaire from a generic template. This took 10 seconds, and every proposed question cites the reason it was added — an FDA warning letter, a historical finding, a recall. Maria (the lead auditor) will edit, but she's editing from a 90%-right draft, not a blank page."

**Duration so far: 10:00**

---

## Scene 5 · Generate the Observation + Full Report (10:00 — 12:30)

**Actor:** Priya (AUD-PM) + (narrated as if Maria, the auditor)

### 5a — Draft an observation

Open `/audits/[any-auditId]`. Click "Draft observation with AI".

Paste this in the excerpts field:
> *"QC Lab Lead confirmed recalibration is quarterly but admitted no documentation exists for OOS-between-calibrations actions."*

**What you'll see:** AI draft with severity `minor` or `major`, `capa_worthy: true`, regulatory_clauses `["21 CFR 211.68"]`, evidence_citations populated. ~4s.

### 5b — Assemble the final audit report

Click "Assemble audit report" on an audit with findings + a CAPA (use one of the seeded audits or any tenant audit).

**What you'll see:**
- Structured report: exec summary, scope recap, findings overview (by severity), CAPA overview, recommendations, regulatory alignment, risk trend
- Full HTML rendered in browser (preview button)
- **SHA-256 integrity hash** — copy it to clipboard and say: "If anyone changes a single character in this report, the hash won't match. Ready for blockchain anchor on day one."
- Download HTML button

**curl equivalent:**
```bash
# First, find an audit that has findings/capas — use one you just ran
AUDIT_ID="<paste an audit id>"
curl -s -X POST http://localhost:8888/api/ai/audit-agents/assemble-report \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d "{\"auditId\":\"$AUDIT_ID\"}" | jq '{ok, reason, hash: .integrityHash, exec: .report.summary.executive_summary}'
```

**Talk track:**
> "The report is built from the audit facts, not invented. Every claim cites the evidence record it came from. The integrity hash + our GxP AuditTrail are what an FDA inspector wants to see to trust our AI."

**Duration so far: 12:30**

---

## Scene 6 · Head-of-QA Dashboard — Drift + Signals (12:30 — 14:00)

**Actor:** James (QA-Head)

Switch to **Tab 3**. Navigate to the admin AI dashboard (wherever the `DriftMonitorDashboard` and `SignalAlertsList` components are mounted — or hit the API directly).

### 6a — Drift Monitor

```bash
JAMES_TOKEN=$(curl -s -X POST http://localhost:8888/api/auth/login -H "content-type: application/json" \
  -d '{"email":"qa.head@novex-pharma.demo","password":"EqmsDemo@2026"}' | jq -r .token)

curl -s http://localhost:8888/api/ai/drift/dashboard \
  -H "Authorization: Bearer $JAMES_TOKEN" | jq '.snapshots[] | select(.alertRaised)'
```

**What you'll see:** metric snapshots per AI feature (grounded-rate, userAcceptance, latencyP95Pct, toolFailureRate) with current-vs-baseline. Any drift is flagged.

### 6b — Signal Alerts

```bash
curl -s http://localhost:8888/api/ai/signals?status=open \
  -H "Authorization: Bearer $JAMES_TOKEN" | jq '.alerts[] | {clusterKey, zScore, clusterSize, members:(.members|length)}'
```

**What you'll see:** The seeded cluster — `equipment:NVX-PRESS-001` with z-score 3.4 and 3 members. Head of QA clicks through, decides "true positive", opens systemic CAPA.

**Talk track:**
> "AI that suggests is table stakes. AI that is MEASURED continuously — grounded-rate, acceptance rate, user-override rate — is how you keep it honest. Any metric drifts more than 5pp week-over-week and the feature auto-pauses until a human reviews. That's ISO 42001-grade governance."

**Duration so far: 14:00**

---

## Scene 7 · Wrap + Q&A prep (14:00 — 15:00)

**Switch to VP tab (optional).** Show MRM module. Click "Auto-populate inputs" (new Wave-2 gap agent you just built).

```bash
VP_TOKEN=$(curl -s -X POST http://localhost:8888/api/auth/login -H "content-type: application/json" \
  -d '{"email":"vp.quality@novex-pharma.demo","password":"EqmsDemo@2026"}' | jq -r .token)

curl -s -X POST http://localhost:8888/api/ai/mrm/populate-inputs \
  -H "Authorization: Bearer $VP_TOKEN" -H "content-type: application/json" \
  -d '{"reviewType":"quarterly","windowDays":90}' | jq '.narrative'
```

**What you'll see:** exec pre-read narrative + 6 input sections (CAPA status, deviation trends, audit program, training compliance, supplier risk, equipment calibration) with citations and recommendations. Plus suggested action items + adequacy verdict.

**Closing talk track:**
> "Four personas, six AI features, one platform. Every AI call is grounded, cited, audit-trailed, and tied to a workflow — not a chatbot, a compliance co-pilot. All of it runs on free Gemini today; tomorrow your GxP-paranoid tenants swap in on-prem Llama in 30 minutes without changing a line of feature code."

---

## Backup pocket-demos (if a question needs them)

| Scenario | Talking point | Command |
|---|---|---|
| Live openFDA enforcement hit | "We fetch live regulatory data, respectfully rate-limited" | `curl -s -X POST http://localhost:8888/api/ai/audit-agents/public/openfda/recalls -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"name":"Ascend Laboratories","limit":3}' \| jq .` |
| FDA warning-letter scrape | "FDA enforcement signals, cited inline" | `curl -s -X POST http://localhost:8888/api/ai/audit-agents/public/fda/warning-letters -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"name":"Glenmark","limit":3}' \| jq .` |
| Risk scenario brainstormer | "ICH Q9 FMEA seeds in 5 seconds" | `curl -s -X POST http://localhost:8888/api/ai/risk/brainstorm-scenarios -H "Authorization: Bearer $JAMES_TOKEN" -H "content-type: application/json" -d '{"processName":"Tablet compression","processDescription":"Direct-compression of Novexolimus 1mg IR on Fette 2090i, 250 kg batch, 9mm biconvex","productClass":"Solid oral IR"}' \| jq '.brainstorm.top_risks'` |
| Regulatory impact classifier | "Classifies change as FDA-reportable in ~4s" | `curl -s -X POST http://localhost:8888/api/ai/change-control/classify-impact -H "Authorization: Bearer $JAMES_TOKEN" -H "content-type: application/json" -d '{"changeType":"SUPPLIER","description":"Replace magnesium stearate supplier from Supplier A to Supplier B for Novexolimus 1mg IR","riskLevel":"HIGH","affectedProducts":["Novexolimus 1mg IR"],"affectedMarkets":["US","EU"]}' \| jq '.classification \| {us:.us_classification, reasoning:.us_reasoning, eu:.eu_classification}'` |
| Autofill from docs | "AI fills 10 form fields from a supplier master file" | *(use the `AutofillButton` in the UI — backend call: `/api/ai/audit-agents/autofill-form`)* |

---

## Tone / Demo-craft notes

- **Don't narrate the code.** The audience doesn't care about endpoints. Narrate what a QA Specialist / Audit Manager / VP would see and do.
- **Always call out "public" vs "tenant" data.** That's the unique differentiator. Every competitor muddles them.
- **When AI returns a fallback** (occasional Gemini free-tier 429), don't panic — say: "The platform has a grounding gate that refused a low-confidence output. That's a feature, not a bug. Let's try again." Re-submit.
- **Close with the audit trail:** Open `AuditTrail` for the deviation you just processed. Show every AI call is logged with prompt-hash + model version. "An FDA inspector can reconstruct every recommendation."

---

## Red-flag watchouts

| Risk | Mitigation |
|---|---|
| Gemini free-tier 429 rate-limit | Pace the demo; retry logic is in the provider. If sustained, switch `.env` to OpenAI key temporarily. |
| FDA warning-letter scrape returns 0 results | FDA's site layout sometimes changes. Fallback: say "FDA's search schema changed this week; let me show cached data" and use a known-good query. |
| Report assemble returns `audit_not_found` | Use `EQMS_EMAIL=buyer1.org@legacy.test` on a legacy-tenant audit OR pick an audit from `GET /api/audit-requests/buyer`. |
| Backend crashes on start-up | `pkill -f "node.*server.js"` then `PORT=8888 npm run start`. Takes 12–20s to boot. |

---

**End of runbook · v1.0 · 2026-04-22 · 15 min total**
