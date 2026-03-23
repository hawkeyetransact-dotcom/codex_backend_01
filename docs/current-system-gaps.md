# Current System Gaps

## Summary
The current platform is functional and rich, but it is not yet a modular eQMS kernel. It is a layered MVP where legacy audit workflow logic, newer milestone/status tracking, V2 assessment scaffolding, document-vault evolution, and marketplace/qualification additions coexist.

## Architectural Gaps
- No unified workflow runtime; live GMP behavior is still controller-driven around `audit-requests-master`.
- Workflow logic remains audit-specific and controller-heavy.
- Multiple overlapping status systems create ambiguity.
- Evidence is split across legacy audit evidence and DocVault.
- Findings are not first-class in the legacy path; they are embedded in audit reports.
- Audit trail exists but is not yet a generic immutable kernel ledger.
- Signatures exist only as local patterns, not a reusable cross-entity signature domain.
- Retention and legal hold are not first-class.
- Participant model is limited to buyer/supplier/auditor patterns.
- Standards logic exists for compliance, but not as universal standards packs across all workflows.

## Data Model Gaps
- Inconsistent `ref` naming weakens relationship integrity.
- `audit-requests-master` is overloaded with parties, scope, statuses, calendar data, org context, and embedded phase state.
- `auditQuestions` is overloaded with template lineage, live response data, follow-up state, and evidence/CAPA links.
- Legacy audit flow and assessment V2 coexist without a unified compatibility boundary.

## Extensibility Gaps for Multi-Workflow Support
- New workflow types are not declarative today.
- Subject abstraction is missing; current flows assume supplier/site/product audit semantics.
- Capability/entitlement model is still partial and module-oriented.

## Overall Conclusion
The current system is good enough to support an additive kernel migration, but it is not itself the kernel. The main challenge is fragmentation of workflow state, evidence handling, and participation models across several partially overlapping generations of architecture.
