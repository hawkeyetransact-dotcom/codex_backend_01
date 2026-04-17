# HawkEye Platform — Documentation Index

All documentation organized by category. Open `.html` files in Chrome → Ctrl+P → Save as PDF.

---

## 01 — Architecture
| Document | Format | Description |
|---|---|---|
| [Technical Architecture](01-architecture/technical-architecture.html) | HTML/PDF | Full system architecture: 14 sections, 161 models, 105+ endpoints |
| [Architecture Diagram](01-architecture/architecture-diagram.html) | HTML/PDF | Visual AWS-style diagram with auto-connected arrows (8 zones) |
| [Technical Architecture (MD)](01-architecture/technical-architecture.md) | Markdown | Text version of the architecture doc |
| [Master Architecture Plan](01-architecture/platform-architecture-master-plan.md) | Markdown | North star vision: Phase 0 → Phase 4 evolution |

## 02 — Deployment & IT
| Document | Format | Description |
|---|---|---|
| [IT Deployment Guide](02-deployment/deployment-guide.html) | HTML/PDF | Cloud (Vercel/AWS) + On-Premise (Docker) installation, env vars, security, scaling |

## 03 — User Guides
| Document | Format | Description |
|---|---|---|
| [Pharma Audit Only Guide](../frontend/docs/user-guide-pharma-audit.html) | HTML/PDF | For API Manufacturers (buyer+supplier) using audit module only |
| [Full EQMS Guide](../frontend/docs/user-guide-pharma-eqms.html) | HTML/PDF | For API Manufacturers using full EQMS + internal/external audit |

## 04 — Processes & Workflows
| Document | Format | Description |
|---|---|---|
| [Audit Flow Swimlane](04-processes/audit-flow-swimlane.html) | HTML/PDF | 14-step swimlane: Buyer → Supplier → Auditor with data flow |
| [Super User Process (24 steps)](08-reference/superuser-process-flow-24steps.md) | Markdown | Industry expert validated 24-step audit process |

## 05 — Compliance
| Document | Format | Description |
|---|---|---|
| 21 CFR Part 11 E-Signature Model | Code | `src/models/electronicSignatureModel.js` |
| ALCOA+ Data Integrity Log | Code | `src/models/dataIntegrityLogModel.js` |

## 06 — Roadmap & Requirements
| Document | Format | Description |
|---|---|---|
| [Roadmap + URS + Competitor Analysis](06-roadmap/roadmap-and-urs.html) | HTML/PDF | Phased roadmap (P0-P3), 89 user requirements, 6-vendor comparison, gap analysis |

## 07 — Marketing & Sales
| Document | Format | Description |
|---|---|---|
| [Customer Playbooks](07-marketing/customer-playbooks.html) | HTML/PDF | 3 customer demo scripts, module config, vocabulary, onboarding checklist |
| [Investor Pitch (YC)](07-marketing/investor-pitch-yc.html) | HTML/PDF | 10-slide pitch deck: problem, solution, market, product, traction, ask |
| [Sales Deck](07-marketing/sales-deck.html) | HTML/PDF | 7-slide customer-facing deck: pain points, solution, modules, ROI, pricing |

## 08 — Reference
| Document | Format | Description |
|---|---|---|
| [Super User Process Flow](08-reference/superuser-process-flow-24steps.md) | Markdown | 24-step audit process from industry expert |

## 09 — Test Reports
| Document | Format | Description |
|---|---|---|
| [Test Plan](../frontend/docs/test-plan.html) | HTML/PDF | 6-layer test strategy: 25 files, 120+ tests, all modules/industries |
| Test Results | Generated | Run: `npx playwright show-report e2e-report-full` |
| Demo Video | .webm | `frontend/test-results-demo/.../video.webm` (8 min) |

---

## Quick Links

| What | Where |
|---|---|
| Frontend URL | https://hawkeye-frontend-dev-chi.vercel.app |
| Backend URL | https://hawkeye-backend-dev.vercel.app |
| API Docs | https://hawkeye-backend-dev.vercel.app/api-docs |
| GitHub (Backend) | hawkeyetransact-dotcom/codex_backend_01 |
| GitHub (Frontend) | hawkeyetransact-dotcom/codex_frontend_01 |
| Login | buyer1.org@legacy.test / Testing@2022 |
