# AI Wave 3 — Scaffolds

**Status:** design-stage stubs. Each file defines the contract; implementation lands in Q1-Q2 2027 per the gap spec.

Wave 3 moves Hawkeye from 8/10 to 10/10. It unlocks predictive quality, on-prem LLM for GxP-paranoid tenants, IoT-AI fusion, and auditor-development tooling.

## Deliverables

| File | Primitive | Effort | Depends on |
|---|---|---|---|
| `predictiveCapaEffectiveness.js` | Calibrated classifier — will this CAPA close on time & be effective? | L | Labelled historical CAPA outcomes |
| `deviationSignalDetector.js` | Cluster new deviations against historical corpus; flag emerging trends | L | Vector DB (Wave 2) |
| `iotEquipmentFusion.js` | Ingest MQTT/OPC-UA telemetry; trigger deviations + CAPA on excursions | L | IoT gateway (new infra) |
| `onPremLlmDeploy.js` | Deploy vLLM + Llama 3 in tenant VPC; gateway routes to it transparently | L | Infra + tenant onboarding |
| `auditorCoach.js` | Private AI review of auditor's draft observations; feeds marketplace rating | M | Observation drafter (Wave 2) |
| `driftMonitor.js` | Scheduled eval re-runs; alert on grounded-rate / acceptance-rate drift | M | Eval harness (Wave 1) + active-learning (Wave 2) |

## Build order

1. `driftMonitor.js` — operational hygiene first; you cannot ship predictive ML without it.
2. `predictiveCapaEffectiveness.js` + `deviationSignalDetector.js` — classical ML on top of existing corpus.
3. `iotEquipmentFusion.js` — requires new ingress infra; coordinate with SRE.
4. `onPremLlmDeploy.js` — one tenant pilot first; then productise.
5. `auditorCoach.js` — marketplace-side value-add; polish once Cross-Co Audit AI is stable.

## Validation notes

- Every predictive model requires a written **Intended Use Statement**
  (per FDA AI-quality guidance 2025) — what the model predicts, inputs,
  outputs, risk class, fail-mode catalog.
- Calibration curves required: confidence scores must reflect actual accuracy.
- Drift thresholds: weekly eval re-run; auto-pause feature if grounded-rate
  drops >5pp or user-acceptance drops >10pp.
- On-prem LLM tenants opt-in to a distinct SLA: slower latency, no drift
  auto-updates (they must pull).
