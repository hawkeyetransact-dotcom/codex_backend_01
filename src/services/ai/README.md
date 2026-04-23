# Hawkeye AI Platform

This directory implements the AI platform described in
[`docs/03-user-guides/pharma-ai-gap-spec.pdf`](../../docs/03-user-guides/pharma-ai-gap-spec.pdf).

Wave 1 is **built and runnable**. Waves 2 and 3 are **scaffolded** with
stub functions that throw `NOT_IMPLEMENTED_WAVE2` / `NOT_IMPLEMENTED_WAVE3`
and design docs you can hand to engineers.

---

## Layout

```
src/services/ai/
├── gateway/                Wave 1 ✅
│   ├── llmGateway.js       — unified entry (generate, hashPrompt)
│   ├── anthropicProvider.js— Claude adapter (raw fetch)
│   ├── openaiProvider.js   — GPT adapter (openai npm pkg)
│   └── legacyProvider.js   — Gemini + local (via llmServiceClient.js)
├── redaction/              Wave 1 ✅
│   └── piiRedactionService.js — pre-LLM redact + unredact, per-tenant policy
├── audit/                  Wave 1 ✅
│   └── aiAuditTrail.js     — writes every AI call to main AuditTrail
├── grounded/               Wave 1 ✅
│   └── groundedGenerationService.js — citation gate + re-ask + fallback
├── features/               Wave 1 ✅ (two features shipped)
│   ├── capa/
│   │   ├── capaRcaDrafter.js       — draft 5-why + actions + effectiveness
│   │   └── capaRcaPrompt.js        — prompt template (v1.0.0)
│   └── deviation/
│       ├── deviationFiveWhyScaffolder.js
│       └── deviationFiveWhyPrompt.js
├── wave2/                  Wave 2 🚧 scaffolded
│   ├── README.md
│   ├── toolCallingRuntime.js
│   ├── multiStepAgent.js
│   ├── vectorDbMigration.js
│   ├── activeLearningLoop.js
│   └── crossCompanyAudit/
│       ├── supplierRiskDossier.js
│       ├── observationDrafter.js
│       └── realTimeFollowupSuggester.js
└── wave3/                  Wave 3 🚧 scaffolded
    ├── README.md
    ├── predictiveCapaEffectiveness.js
    ├── deviationSignalDetector.js
    ├── iotEquipmentFusion.js
    ├── onPremLlmDeploy.js
    ├── auditorCoach.js
    └── driftMonitor.js
```

---

## Wave 1 HTTP surface (live)

Mounted at `/api/ai` in `src/app.js`:

| Method | Path | Description |
|---|---|---|
| POST | `/api/ai/capa/draft-rca` | Draft a CAPA RCA from a deviation narrative + retrieval set |
| POST | `/api/ai/deviation/scaffold-five-why` | Scaffold a 5-why investigation |
| POST | `/api/ai/decisions/outcome` | Record the user's disposition of an AI draft (accept/edit/reject) |

Each endpoint is authenticated + tenant-scoped. AI drafts are **never saved
directly** — they are returned to the client for human review and e-sig.
The `/outcome` endpoint closes the audit loop.

---

## Configuration (env)

**Required (at least one provider):**
- `ANTHROPIC_API_KEY` — enables Claude
- `OPENAI_API_KEY` — enables GPT
- `LLM_SERVICE_URL` + `LLM_PROVIDER=local` — enables legacy on-prem path

**Defaults:**
- `LLM_DEFAULT_PROVIDER` — default `anthropic`
- `LLM_ANTHROPIC_MODEL` — default `claude-opus-4-7`
- `LLM_OPENAI_MODEL` — default `gpt-4-turbo`
- `LLM_FALLBACK_PROVIDER` — optional; used if primary provider errors

---

## The four Wave-1 guarantees

Every feature that uses `groundedGenerate()` gets these for free:

1. **Grounded or silent.** If the LLM returns no citations (when required)
   or confidence below threshold, the response is a fallback message —
   never a hallucination.
2. **Structured output.** Caller declares required fields; the runtime
   parses + validates + re-asks on failure.
3. **PII redacted before egress.** Default-on for email, phone, SSN,
   credit-card, API keys, patient IDs. Per-tenant policy can extend or
   disable (for on-prem LLMs).
4. **Audit trail on every call.** Every decision (successful or fallback)
   is written to the main `AuditTrail` with prompt-hash, retrieval-set
   hash, model version, confidence, and redactions applied. FDA inspectors
   can reconstruct any AI recommendation.

---

## The human-in-the-loop contract

**The AI never writes a record. Full stop.**

- Every AI draft is displayed in the UI with the source docs cited.
- The user reviews, edits, and e-signs before it becomes a record.
- The e-sig is attached to the *final* output, not the AI draft.
- `/api/ai/decisions/outcome` records whether the user accepted, edited,
  or rejected — that signal feeds Wave 2's active-learning loop.

---

## Quick smoke test (Wave 1)

```bash
# Hash a prompt
node -e "
import('./src/services/ai/gateway/llmGateway.js').then(m =>
  console.log('hash:', m.hashPrompt('hello'))
)"

# Redact PII
node -e "
import('./src/services/ai/redaction/piiRedactionService.js').then(m => {
  const r = m.redactString('email me at a@b.com or call 555-123-4567');
  console.log(r);
})"

# Full round-trip requires ANTHROPIC_API_KEY (or OPENAI_API_KEY) and is
# tested via the API endpoint — see docs/03-user-guides/pharma-ai-gap-spec.pdf.
```

---

## Build order recap

- **Wave 1 (Q1-Q2 2026)** — done. Foundations + 2 inline assists.
- **Wave 2 (Q3-Q4 2026)** — tool-calling + agents + vector DB + Cross-Company Audit AI. See `wave2/README.md`.
- **Wave 3 (Q1-Q2 2027)** — predictive ML + on-prem LLM + IoT fusion + drift monitor + auditor coach. See `wave3/README.md`.

---

## Testing

No test framework is wired in this repo yet. Once Jest or Vitest lands,
the following files need coverage first:

- `gateway/llmGateway.js` — `resolveCallPlan` + fallback chain
- `redaction/piiRedactionService.js` — roundtrip redact/unredact (fast regression surface)
- `grounded/groundedGenerationService.js` — citation gate + re-ask loop
- `audit/aiAuditTrail.js` — `recordAiDecision` writes to AuditTrail

Smoke tests verified: all Wave 1 modules parse and export the documented interface.
