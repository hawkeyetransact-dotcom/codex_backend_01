# Deployment Models & LLM Strategy

> SaaS · Private Cloud · Hybrid · On-prem — module-by-module, with the LLM/agentic story per model.
> Owner: founder + CTO · Last updated: 2026-04-26 · Status: draft

The choice of deployment model is **not a feature toggle — it's a pricing tier and an architectural commitment**. SaaS is the default; everything else carries a price premium.

---

## 1. The four models — at a glance

| Model | Where the data lives | Where the LLM lives | Where the agents run | Typical buyer | Price premium vs SaaS |
|---|---|---|---|---|---|
| **SaaS (multi-tenant)** | Hawkeye Vercel/Mongo Atlas | Cloud — Gemini Flash-Lite (free tier) + Claude Sonnet (paid) | Hawkeye serverless | SMB pharma, greenfield | baseline (1.0x) |
| **Private Cloud (single-tenant)** | Customer's AWS/Azure/GCP account | Cloud LLM via VPC endpoint | Customer's account | Mid-market with privacy/SOX | +50% to +100% |
| **Hybrid** | Customer's VPC for sensitive data; Hawkeye SaaS for non-sensitive | Cloud LLM with PII redaction proxy | Hawkeye SaaS for orchestration; sensitive call-outs go through customer's egress proxy | Pharma BigCo, EU GDPR sensitive | +30% to +75% |
| **On-prem (airgapped or restricted egress)** | Customer's data center | On-prem (Llama 3.1 70B / Mixtral 8x22B / Qwen 2.5 / Ollama) | Customer's data center | BigPharma · regulatory-restricted geos · airgapped CRO · government | +150% to +300% |

---

## 2. SaaS (default) — *the only model we sell at SMB price*

**Architecture today** (live):
- Frontend: Next.js on Vercel (multi-tenant; tenant resolved per-domain or per-org-id JWT).
- Backend: Node/Express on Vercel serverless functions; one MongoDB Atlas cluster, sharded per tenant via `tenant_id` field; Postgres for marketplace catalog.
- Workers: Vercel cron for scheduled jobs (OVERDUE scan, EXPIRE scan, monthly scorecards).
- LLM calls: direct REST to Gemini API + Anthropic API.
- Auth: JWT-only today; OAuth + SAML on the deployment-models roadmap.

**LLM strategy**:
- **Default model**: Gemini 2.5 Flash-Lite (free tier) for high-volume, low-stakes agents (questionnaire pre-fill, observation drafter).
- **Premium model**: Claude Sonnet 4.6 for high-stakes drafting (audit report assembler).
- **Routing service**: `groundedGenerate.js` already routes per-feature with fallback.

**Value prop**:
- Zero infra setup. Buyer signs a credit-card → invite users → start using.
- AI agents always available, no extra ops.
- Price: **base SaaS price** (engine + 1 vertical pack from $30k/yr).

**When NOT to sell SaaS**:
- Customer has a written policy "no production data outside our VPC" → upgrade to Private Cloud.
- Customer is a regulator-facing record-keeper for non-cloud-permitted geos (China · Russia · India CDSCO-stricted) → On-prem.
- Customer is a BigPharma with a procurement requirement for SOC 2 Type II + HIPAA BAA + EU SCCs + custom DPA → Hybrid (SaaS engine, customer-VPC data).

---

## 3. Private Cloud (single-tenant) — *for mid-market with stricter compliance*

**What changes vs SaaS**:
- One MongoDB Atlas cluster per tenant (or customer's own Atlas account).
- Vercel project per tenant (or customer's own AWS / Azure / GCP).
- LLM calls go through customer's VPC endpoint (Gemini via Google Cloud private connection, Claude via AWS Bedrock).
- Marketplace catalog (Postgres) can be either Hawkeye-shared (read-only sync) or per-tenant (no marketplace participation).

**Module separation**:
- **All EQMS modules** (Document Control · CAPA · etc.) — fully in customer's VPC.
- **Marketplace** — *optional* — if customer joins the marketplace, a unidirectional outbound sync writes anonymized supplier metadata + audit-report metadata to Hawkeye's shared Postgres. Customer can opt out and run a "private supplier directory" only.
- **AI agents** — same as SaaS, but routed through customer's VPC LLM endpoint. Agent code runs in customer's serverless project.
- **Public regulatory intel scrapers** (openFDA, EMA EudraGMDP, WHO PQ) — run in Hawkeye's shared infrastructure (no customer data) → push results into customer's VPC via API.

**LLM strategy**:
- Customer's choice: cloud LLM via VPC endpoint, OR on-prem LLM (rare for Private Cloud — usually customers in this tier are OK with cloud LLM through their VPC).
- **Token spending governance** — full Admin Panel (Doc 4) controls per-user agent quotas.

**Value prop**:
- Data residency (EU GDPR, India PDPB, etc.).
- SOC 2 Type II / HIPAA BAA / 21 CFR Part 11 audit boundary stays in customer's account.
- Customer's CISO can audit infrastructure access logs in their own SIEM.

**Price premium**: +50% to +100% over SaaS — covers per-tenant infra cost + ops overhead + SLA tier.

---

## 4. Hybrid — *for BigPharma with the "data stays in our VPC, AI can be cloud" stance*

**The principle**: split the architecture along the **data-vs-compute** seam.

```
                        ┌─────────────────────────────────────┐
                        │      CUSTOMER'S VPC (their cloud)    │
                        │  - All Mongo collections (tenant DB)│
                        │  - All file storage (S3 / Azure Blob)│
                        │  - PII redaction proxy              │
                        └────────────┬────────────────────────┘
                                     │  (TLS, mutual auth)
                                     │  redacted prompts only
                                     ▼
                        ┌─────────────────────────────────────┐
                        │      HAWKEYE SaaS (our cloud)        │
                        │  - Workflow runtime (state mgmt)    │
                        │  - Agent orchestration              │
                        │  - Cloud LLM calls                  │
                        │  - Marketplace                      │
                        └─────────────────────────────────────┘
```

**Module separation**:
- **Sensitive modules** (Batch Records · Deviation · Complaint with patient data · Manufacturing data) — data in customer VPC; only metadata + audit-trail summaries flow to Hawkeye.
- **Non-sensitive modules** (Supplier Pre-Qual · Audit · Document Control of public SOPs · Marketplace) — Hawkeye SaaS.
- **AI agents** — agent runtime in Hawkeye SaaS; **PII redaction proxy** in customer VPC scrubs PHI / proprietary process data before the prompt leaves the VPC.

**LLM strategy**:
- All LLM calls go to cloud LLM (Gemini / Claude).
- **PII Redaction Proxy** (the technical piece that makes this credible):
  - Runs as a Node service in customer's VPC.
  - Intercepts every prompt before egress.
  - Strips: patient names, lot numbers, supplier business secrets matching a customer-supplied dictionary, financial figures > threshold.
  - Redacted prompt → cloud LLM → response → un-redacted in customer VPC if needed (lookup table in VPC).
- **Customer can audit every prompt** via the proxy log.

**Value prop**:
- BigPharma DPO can answer "no PHI ever leaves our VPC" while still using cloud LLM.
- Hawkeye gets to keep the marketplace + workflow OS as a managed service.

**Price premium**: +30% to +75% over SaaS — covers PII proxy infra + monitoring + DPA negotiation.

---

## 5. On-Prem — *the hardest sell, the highest price, the deepest moat*

This is the model that wins **BigPharma in restricted geographies**, **CROs with airgapped network policies**, and **government / defense-adjacent** opportunities.

### What "on-prem" actually means

Three sub-flavors, each with different LLM implications:

| Flavor | Egress | LLM lives where | Use case |
|---|---|---|---|
| **Restricted egress** | Allow-list of DNS / IPs (e.g., Hawkeye's API, customer's IDP) | Cloud LLM via allow-list | Mid-market customer with restrictive egress firewall |
| **Customer-managed cloud** | Customer's AWS GovCloud / Azure Gov / Alibaba Cloud (China) | Cloud LLM in same gov region (Bedrock GovCloud, Azure OpenAI Gov) | US gov · EU sovereign · China (Alibaba Qwen) |
| **Airgapped (true on-prem)** | No egress at all | **On-prem LLM running on customer GPUs** | Defense · DRDO/ISRO-adjacent · BigPharma R&D centers |

### The on-prem LLM stack — what we deploy

For airgapped on-prem, Hawkeye ships a **reference LLM serving stack** that the customer's IT can deploy:

**Recommended models** (one of):
1. **Llama 3.1 70B Instruct** (Meta) — best general-purpose, fits on 2× A100 80GB.
2. **Mixtral 8x22B Instruct** (Mistral) — strong reasoning, fits on 2× A100 80GB.
3. **Qwen 2.5 72B Instruct** (Alibaba) — best for China/Asia regulatory text.
4. **Gemma 2 27B** (Google) — smallest viable, fits on 1× A100 40GB or 1× L40S.

**Recommended serving stack**:
- **vLLM** for high-throughput batched inference (default for >10 concurrent users).
- **Ollama** for simple single-node deployments (≤5 concurrent users).
- **TensorRT-LLM + Triton** for NVIDIA-optimized installs (BigPharma data centers with H100s).

**Hardware sizing reference** (single tenant, 50 users, 1000 agent runs/day):
- Minimum: 1× NVIDIA A100 80GB → ~30 tokens/sec on 70B model, sufficient for batched workload with queuing.
- Recommended: 2× A100 80GB → ~80 tokens/sec, allows two agents concurrently.
- Premium: 1× H100 80GB → ~120 tokens/sec, allows real-time chat experience.

**Serving infrastructure provided in the on-prem bundle**:
- Containerized model serving (Docker / Kubernetes / Helm chart).
- LLM router that maps Hawkeye's existing `groundedGenerate.js` provider abstraction to the on-prem endpoint — zero code change in app code.
- Embedded vector store (Qdrant or Weaviate, on-prem) for RAG retrieval.
- **Vertical-pack-tuned prompt library** — Hawkeye ships pre-tuned prompts that perform well on Llama 70B (different from cloud-LLM prompts).

### Agent feature parity on on-prem

Not all agents work equally well on Llama 70B vs Claude Sonnet. Honest delta:

| Agent | Cloud (Sonnet/Gemini) | On-prem (Llama 70B) |
|---|---|---|
| Pre-Audit Questionnaire pre-fill | Excellent | **Excellent** (KB-grounded, low complexity) |
| Supplier-Intel public-data fusion | Excellent | **Limited** (requires public-internet fetches; needs proxied scraper or pre-indexed DB) |
| Audit Report Assembler | Excellent | **Good** (slightly less polished prose, regulatory citations may need second-pass review) |
| Observation Drafter | Excellent | **Good** |
| CAPA RCA Drafter (5-Whys) | Excellent | **Excellent** |
| Risk Brainstormer | Excellent | **Good** |

**The honest pitch to on-prem buyers**: 5 of 6 agents perform at SaaS-grade quality on Llama 70B; Supplier-Intel requires either internet egress or a pre-indexed regulatory DB (Hawkeye ships a bundled openFDA mirror updated quarterly).

### What's NOT in the on-prem bundle

Be explicit so the IT team trusts us:

- ❌ **Marketplace** — networking effect requires SaaS multi-tenancy. On-prem customer can sync supplier-master data inbound from the cloud marketplace, but cannot publish into it.
- ❌ **Public regulatory intel** — automated scrapers can't reach openFDA without egress. Hawkeye provides a quarterly-updated bundled DB.
- ❌ **Auto-updates** — on-prem customer chooses when to install upgrades.
- ❌ **Support telemetry** — opt-in only.

### Pricing for on-prem

- **License fee**: $80k-200k/yr per tenant (vs $30-60k for SaaS).
- **Initial deployment fee**: $50k-150k one-time (white-glove install + GPU procurement support + air-gap testing).
- **Annual support fee**: 20% of license/yr (M&S contract).
- **Optional**: per-GPU LLM serving licensing if customer wants Hawkeye to manage LLM ops.

---

## 6. Module-by-module deployment matrix

How each module behaves across the 4 models. Use this as the customer conversation.

| Module | SaaS | Private Cloud | Hybrid | On-prem |
|---|---|---|---|---|
| Document Control | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Change Control | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Training | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Risk Register | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Internal Audit | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Management Review | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Deviation | ✅ | ✅ | ✅ in customer VPC (PHI sensitive) | ✅ |
| CAPA | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Complaint | ✅ | ✅ | ✅ in customer VPC (PHI sensitive) | ✅ |
| Supplier Pre-Qual | ✅ | ✅ | ✅ Hawkeye SaaS (non-sensitive) | ✅ |
| Audit (8-phase) | ✅ | ✅ | ✅ Hawkeye SaaS | ✅ |
| Equipment | ✅ | ✅ | ✅ in customer VPC | ✅ |
| Batch Records | ✅ | ✅ | ✅ in customer VPC (process IP) | ✅ |
| Marketplace | ✅ | ✅ opt-in | ✅ Hawkeye SaaS | ❌ inbound-only |
| AI Agents | ✅ Cloud LLM | ✅ Cloud LLM via VPC | ✅ via PII proxy | ✅ on-prem LLM (5/6 parity) |
| Public Reg Intel | ✅ | ✅ | ✅ | ⚠ quarterly bundled DB only |
| RFQ Procurement | ✅ | ✅ | ✅ Hawkeye SaaS | ✅ private RFQ only (no marketplace) |

---

## 7. Sales playbook — which model to lead with by buyer profile

| Buyer | Recommend |
|---|---|
| SMB pharma (50-500 emp) | **SaaS**. Period. Don't offer alternatives unless asked. |
| Mid-market pharma (500-2,000 emp) with EU operations | **Private Cloud** (EU region) — anchor at +50% premium. |
| BigPharma supplier-quality team (10-50 buyers) | **Hybrid** — sell as "your supplier-network layer, no PHI ever leaves your VPC." |
| BigPharma R&D / restricted geo (China, Russia, India CDSCO) | **On-prem** — engage their IT early; deployment is 8-16 weeks. |
| CRO / contract sterilizer / contract mfr | **SaaS** or **Private Cloud** depending on their customers' DPAs. |
| Government / defense-adjacent (rare) | **On-prem airgapped**, 6-12 month sales cycle. |

---

## 8. What's next on the deployment-models roadmap

| Quarter | Item |
|---|---|
| Q3 2026 | Private Cloud deployment runbook + first paid Private Cloud customer |
| Q3 2026 | Hybrid PII-redaction proxy (open-source the proxy, keep the prompts proprietary) |
| Q4 2026 | On-prem reference architecture published (whitepaper + Helm chart) |
| Q1 2027 | First on-prem paid pilot (target: BigPharma APAC R&D center) |
| Q1 2027 | SOC 2 Type II audit complete (unblocks Private Cloud BigPharma deals) |
| Q2 2027 | HIPAA BAA available + first hybrid med-device customer with PHI |

---

## 9. The on-prem LLM honesty section

For your IT-team pitch (Doc 6 Track B), be ready to defend these claims honestly:

- **"Llama 3.1 70B matches Claude Sonnet for 5/6 of our agents."** Fair — based on internal eval. Can be reproduced with vendor evals (HumanEval, MMLU, MT-Bench).
- **"Customer's GPUs, customer's data, no egress."** True for the airgapped flavor.
- **"5/6 agent parity, NOT 6/6."** The honest delta — Supplier-Intel requires either egress OR a bundled openFDA mirror. Don't oversell.
- **"Setup is 4-8 weeks for a competent IT team."** True if they have GPUs procured. Add 8-12 weeks if they need to procure A100s.
- **"Hawkeye's app code is identical between SaaS and on-prem."** True — only the LLM provider URL changes via env var. This is the moat: the same workflow OS runs in both modes.

Don't claim:
- "Same speed as SaaS." False — on-prem 70B at ~30 tokens/sec vs Sonnet at ~80 tokens/sec.
- "All agents work identically." False — Supplier-Intel is degraded.
- "No GPU procurement needed." False — they need at least 1× A100 80GB or equivalent.
