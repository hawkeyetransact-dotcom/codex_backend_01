# AI Wave 2 — Scaffolds

**Status:** stubs + interface contracts. Do not wire routes until each file replaces `NotImplementedError` with a tested implementation.

Wave 2 moves Hawkeye from 6/10 to 8/10 AI maturity. It unlocks AI that *acts*, not just drafts.

## Deliverables

| File | Primitive | Effort | Depends on |
|---|---|---|---|
| `toolCallingRuntime.js` | Typed tool registry with read/write taxonomy + e-sig gates on mutations | M | `../gateway/llmGateway.js` |
| `multiStepAgent.js` | Plan-then-execute agent with budget + reflection + revert | L | `toolCallingRuntime.js`, `../grounded/groundedGenerationService.js` |
| `vectorDbMigration.js` | Move embeddings from Mongo-cosine to `pgvector` (Postgres). Per-tenant schemas. | L | Postgres in docker-compose already; needs prod deployment |
| `activeLearningLoop.js` | Ingest user feedback → retune retrieval weights + prompt variants | M | `../audit/aiAuditTrail.js` for decision history |
| `crossCompanyAudit/supplierRiskDossier.js` | Auto-compile FDA+EMA+WHO-PQ+customs signals into a one-pager | L | Feed ingestion jobs (external) |
| `crossCompanyAudit/observationDrafter.js` | Draft audit observations from evidence + responses with FDA-citation | L | Vector DB for FDA-483 corpus |
| `crossCompanyAudit/realTimeFollowupSuggester.js` | Suggest follow-up questions during live audit | M | Grounded-gen + audit-session context |

## Build order

1. `toolCallingRuntime.js` — foundation for every agent flow.
2. `vectorDbMigration.js` — moves retrieval off Mongo-cosine; needed for all Cross-Co features.
3. `multiStepAgent.js` — agent runtime; orchestrates tools.
4. `activeLearningLoop.js` — feedback ingestion; runs as a scheduled job.
5. `crossCompanyAudit/*` — end-user features built on top.

## Shared interface: `wave2/types.ts` (TODO)

Declare the canonical shapes here once TypeScript is enabled repo-wide:
- `AgentPlan = { steps: PlanStep[]; budget: { maxSteps; maxTokens; maxSeconds } }`
- `ToolDefinition = { name; description; inputSchema; outputSchema; sideEffect: "none"|"write"; requiresESig: boolean }`
- `AgentExecutionRecord = { planId; step; tool; input; output; timestamp; actorUserId }`

## Compliance notes

- **Every write-side tool call requires e-sig.** The agent cannot auto-approve a CAPA or publish an SOP; it drafts + requests e-sig from the configured role.
- **Every plan is shown to the user before execution.** No surprise actions.
- **Every step writes an entry to the main AuditTrail** via `recordAiDecision`. An agent that executes 5 tools produces 5 AuditTrail rows + 1 plan-level row.
- **Tool definitions are versioned** (semver in name). Changing a tool's input schema is a breaking change; bump the major.

## Eval plan

Before any Wave-2 feature ships to tenants:
- Tool-calling eval dataset: 50 scenarios, score = tool picked correctly / total.
- Multi-step agent eval: 20 multi-turn scenarios, score = plan matched reference / total (LLM-as-judge).
- Vector-DB retrieval eval: Recall@5 ≥ 0.85 on golden dataset.
- Active-learning loop: A/B harness must show retrieval improvement ≥ 3pp over 2 weeks.
