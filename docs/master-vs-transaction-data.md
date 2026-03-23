# Master vs Transaction Data

## Scope
This classification covers every discovered Mongoose model in the backend `dev` worktree.

## Method
- This is an architectural classification, not a code-enforced flag in the current system.
- `Master` means reference, identity, directory, template, configuration, or catalog data.
- `Transaction` means operational case data, run data, review data, event logs, or snapshots tied to business activity.
- `Append-only` means the intended usage pattern is event/log/snapshot insertion rather than in-place mutation.

## Full Classification Table
| Model | Collection | Domain | Class | Mutability | Versioning | Notes |
|---|---|---|---|---|---|---|
| access_grants | `access_grants` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| admin_audit_logs | `admin_audit_logs` | Event Log | Transaction | Append-only | Non-versioned | Tenant admin audit log |
| ai_action_metrics | `ai_action_metrics` | Event/Snapshot | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| api-master | `api-masters` | Reference Catalog | Master | Mutable | Non-versioned | Canonical API master |
| api_master_sync | `api_master_syncs` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| api_public_manufacturers | `api_public_manufacturers` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| approval_requests | `approval_requests` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| AskHawkEvalRun | `askhawkevalruns` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| assessment-capas | `assessment-capas` | CAPA | Transaction | Mutable | Non-versioned | Assessment V2 CAPA record |
| assessment-evidence | `assessment-evidences` | Assessment V2 | Transaction | Mutable | Non-versioned | V2 evidence records |
| assessment-findings | `assessment-findings` | Assessment V2 | Transaction | Mutable | Non-versioned | Finding records |
| assessment-types | `assessment-types` | Workflow Reference | Master | Mutable | Non-versioned | Assessment type/configuration |
| assessments | `assessments` | Assessment V2 | Transaction | Mutable | Embedded version-in-document | Emerging assessment runtime root |
| audit-agendas | `audit-agendas` | Audit Workflow | Transaction | Mutable | Non-versioned | Agenda artifact |
| audit-artifact-versions | `audit-artifact-versions` | Audit Workflow | Transaction | Append-only | Versioned | Artifact version snapshots |
| audit-artifacts | `audit-artifacts` | Audit Workflow | Transaction | Mutable | Versioned | Artifact register per audit |
| audit-cycle-templates | `audit-cycle-templates` | Reference/Config | Master | Mutable | Non-versioned | Analytical classification based on naming |
| audit-events | `audit-events` | Event Log | Transaction | Append-only | Non-versioned | Audit-scoped before/after event log |
| audit-notes | `audit-notes` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| audit-plans | `audit-plans` | Audit Workflow | Transaction | Mutable | Non-versioned | Planning artifact |
| audit-reports | `audit-reports` | Reporting | Transaction | Mutable | Non-versioned | Audit report record |
| audit-requests-master | `audit-requests-masters` | Audit Workflow | Transaction | Mutable | Non-versioned | Primary legacy audit transaction record |
| audit-rfq-quotes | `audit-rfq-quotes` | RFQ | Transaction | Mutable | Non-versioned | RFQ quote rows |
| audit-rfq-threads | `audit-rfq-threads` | RFQ | Transaction | Append-only | Non-versioned | RFQ thread messages |
| audit-rfqs | `audit-rfqs` | RFQ | Transaction | Mutable | Non-versioned | RFQ header |
| audit-trails | `audit-trails` | Event Log | Transaction | Append-only | Non-versioned | Audit-scoped trail log |
| audit_request_aliases | `audit_request_aliases` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| auditor-profiles | `auditor-profiles` | Identity/Profile | Master | Mutable | Non-versioned | Auditor profile extension |
| auditor_affiliations | `auditor_affiliations` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| auditQuestions | `auditquestions` | Audit Workflow | Transaction | Mutable | Non-versioned | Generated questionnaire plus responses |
| AuditSchedule | `auditschedules` | Scheduling | Transaction | Mutable | Non-versioned | Audit schedule header |
| AvailabilityBlock | `availabilityblocks` | Scheduling | Transaction | Mutable | Non-versioned | Availability blocks |
| buyer-profiles | `buyer-profiles` | Identity/Profile | Master | Mutable | Non-versioned | Buyer profile extension |
| buyer-risk-profiles | `buyer-risk-profiles` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| capa-risk-indicators | `capa-risk-indicators` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2 | `capa-v2` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-action-items | `capa-v2-action-items` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-action-plans | `capa-v2-action-plans` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-approvals | `capa-v2-approvals` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-candidates | `capa-v2-candidates` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-comments | `capa-v2-comments` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-effectiveness-checks | `capa-v2-effectiveness-checks` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-implementation-evidence | `capa-v2-implementation-evidences` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-intakes | `capa-v2-intakes` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-investigations | `capa-v2-investigations` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-metric-snapshots | `capa-v2-metric-snapshots` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| capa-v2-risk-assessments | `capa-v2-risk-assessments` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-root-causes | `capa-v2-root-causes` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-similarity-links | `capa-v2-similarity-links` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-source-links | `capa-v2-source-links` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capa-v2-status-history | `capa-v2-status-histories` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| capa-v2-triage | `capa-v2-triages` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| capas | `capas` | CAPA | Transaction | Mutable | Non-versioned | Legacy CAPA record |
| catalog_product_variants_v2 | `catalog_product_variants_v2` | Marketplace Catalog | Master | Mutable | Soft-versioned | Canonical product variants |
| catalog_products_v2 | `catalog_products_v2` | Marketplace Catalog | Master | Mutable | Soft-versioned | Canonical marketplace product master |
| categories | `categories` | Reference | Master | Mutable | Non-versioned | Question categories |
| compliance-event-canonical | `compliance-event-canonicals` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| compliance-event-raw | `compliance-event-raws` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| compliance-standards | `compliance-standards` | Standards Reference | Master | Mutable | Non-versioned | Standard/control pack headers |
| compliance_claim_records_v2 | `compliance_claim_records_v2` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| compliance_guideline_documents | `compliance_guideline_documents` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| compliance_guideline_vectors | `compliance_guideline_vectors` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| compliance_question_results | `compliance_question_results` | Compliance | Transaction | Mutable | Derived snapshot | Per-question compliance results |
| compliance_response_snapshots | `compliance_response_snapshots` | Compliance | Transaction | Append-only | Derived snapshot | Questionnaire snapshot at run start |
| compliance_runs | `compliance_runs` | Compliance | Transaction | Mutable | Derived snapshot | Compliance run header |
| compliance_standard_registry | `compliance_standard_registries` | Standards Reference | Master | Mutable | Non-versioned | Tenant standard registration |
| consent_records | `consent_records` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| controls | `controls` | Standards Reference | Master | Mutable | Non-versioned | Control clauses |
| customAudit-question | `customaudit-questions` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| digilocker_access_policies | `digilocker_access_policies` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| digilocker_audit_events | `digilocker_audit_events` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| digilocker_audit_evidence_checklists | `digilocker_audit_evidence_checklists` | Document Vault | Transaction | Mutable | Derived snapshot | Audit evidence readiness projection |
| digilocker_document_extractions | `digilocker_document_extractions` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| digilocker_document_versions | `digilocker_document_versions` | Document Vault | Transaction | Append-only | Versioned | Document version history |
| digilocker_documents | `digilocker_documents` | Document Vault | Transaction | Mutable | Versioned | Reusable document master with currentVersion pointer |
| digilocker_question_evidence_maps | `digilocker_question_evidence_maps` | Document Vault | Transaction | Mutable | Non-versioned | Question-to-document mapping bridge |
| document_access_events | `document_access_events` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| document_links | `document_links` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| document_share_policies | `document_share_policies` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| document_views | `document_views` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| documents | `documents` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| engagement_participants | `engagement_participants` | Engagements | Transaction | Mutable | Non-versioned | Participant bridge |
| engagements | `engagements` | Engagements | Transaction | Mutable | Non-versioned | Buyer-supplier engagement |
| evidence | `evidences` | Audit Evidence | Transaction | Mutable | Non-versioned | Legacy audit-coupled evidence |
| evidence-findings | `evidence-findings` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| evidence_pages | `evidence_pages` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| evidence_uploads | `evidence_uploads` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| external-audits | `external-audits` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| external-capas | `external-capas` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| Fda483 | `fda483` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| FdaCitation | `fdacitations` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| FdaDashboardSnapshot | `fdadashboardsnapshots` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| FdaInspection | `fdainspections` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| formLayouts | `formLayouts` | UI Metadata | Master | Mutable | Non-versioned | Questionnaire form layout metadata |
| GovernanceAuditLog | `governance_audit_logs` | Event Log | Transaction | Append-only | Non-versioned | Governance audit log |
| HawkConversation | `hawkconversations` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| HawkPlaybook | `hawkplaybooks` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| HawkPolicy | `hawkpolicies` | Reference/Config | Master | Mutable | Non-versioned | Analytical classification based on naming |
| HawkUnanswered | `hawkunanswereds` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| integration-audit-logs | `integration-audit-logs` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| integration-connections | `integration-connections` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| integration-mapping-configs | `integration-mapping-configs` | Integration Reference | Master | Mutable | Non-versioned | Mapping configuration |
| integration-providers | `integration-providers` | Integration Reference | Master | Mutable | Non-versioned | Provider catalog |
| integration-run-logs | `integration-run-logs` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| internal-capa-references | `internal-capa-references` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| KbArticle | `kbarticles` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| KbChunk | `kbchunks` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| laboratory-records | `laboratory-records` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| marketplace_listings | `marketplace_listings` | Marketplace Catalog | Master | Mutable | Non-versioned | Published listing master |
| monitoring-signals | `monitoring-signals` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| notification | `notifications` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| Notification | `notifications` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| NotificationDeliveryLog | `notificationdeliverylogs` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| NotificationEvent | `notification_events` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| NotificationFolder | `notification_folders` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| NotificationLabel | `notification_labels` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| NotificationOutbox | `notification_outbox` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| NotificationPolicy | `notification_policies` | Reference/Config | Master | Mutable | Non-versioned | Analytical classification based on naming |
| NotificationPreference | `notificationpreferences` | Reference/Config | Master | Mutable | Non-versioned | Analytical classification based on naming |
| object_acl_grants | `object_acl_grants` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| onboarding_wizard_states | `onboarding_wizard_states` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| org_catalog_items | `org_catalog_items` | Marketplace Catalog | Master | Mutable | Non-versioned | Org catalog items |
| org_claims | `org_claims` | Organization Directory | Master | Mutable | Non-versioned | Tenant-to-org claim mapping |
| org_sites | `org_sites` | Organization Directory | Master | Mutable | Non-versioned | Org site master |
| org_units | `org_units` | Organization Directory | Master | Mutable | Non-versioned | Org department/unit master |
| org_user_assignments | `org_user_assignments` | Organization Directory | Master | Mutable | Non-versioned | User-to-org/site/unit assignment |
| organization_migration_logs | `organization_migration_logs` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| organizations | `organizations` | Organization Directory | Master | Mutable | Non-versioned | Legal entity directory |
| phase-trackers | `phase-trackers` | Workflow Tracking | Transaction | Mutable | Non-versioned | Current phase projection |
| pre-audit-questionnaires | `pre-audit-questionnaires` | Audit Workflow | Transaction | Mutable | Non-versioned | Pre-audit supplier questionnaire |
| product-site-mappings | `product-site-mappings` | Supplier Catalog | Master | Mutable | Non-versioned | Bridge between supplier product and site |
| product_evidence_links_v2 | `product_evidence_links_v2` | Marketplace | Transaction | Mutable | Non-versioned | Marketplace evidence link bridge |
| product_merge_events_v2 | `product_merge_events_v2` | Marketplace Provenance | Transaction | Append-only | Non-versioned | Merge/reconciliation event log |
| product_provenance_events_v2 | `product_provenance_events_v2` | Marketplace Provenance | Transaction | Append-only | Non-versioned | Product provenance events |
| product_refresh_runs_v2 | `product_refresh_runs_v2` | Marketplace Provenance | Transaction | Append-only | Non-versioned | Refresh run history |
| product_review_queue_v2 | `product_review_queue_v2` | Marketplace Provenance | Transaction | Mutable | Non-versioned | Review queue |
| public_actions | `public_actions` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| public_apis | `public_apis` | Public Intel Reference | Master | Mutable | Non-versioned | Public API master |
| public_claim_requests | `public_claim_requests` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| public_filings | `public_filings` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| public_inspections | `public_inspections` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| public_sites | `public_sites` | Public Intel Reference | Master | Mutable | Non-versioned | Public site directory master |
| public_sources | `public_sources` | Public Intel Reference | Master | Mutable | Non-versioned | Tracked public sources |
| public_suppliers | `public_suppliers` | Public Intel Reference | Master | Mutable | Non-versioned | Public supplier directory master |
| public_unmatched | `public_unmatcheds` | Directory/Catalog | Master | Mutable | Non-versioned | Analytical classification based on naming |
| qualification_cases | `qualification_cases` | Qualification | Transaction | Mutable | Non-versioned | Qualification case header |
| qualification_methods | `qualification_methods` | Qualification | Transaction | Mutable | Non-versioned | Qualification methods/sub-records |
| questionnaire-artifacts | `questionnaire-artifacts` | Assessment V2 | Transaction | Mutable | Non-versioned | Assessment questionnaire artifacts |
| questionnaire-section-assignments | `questionnaire-section-assignments` | Audit Workflow | Transaction | Mutable | Non-versioned | Supplier section assignment workflow |
| questionnaireUploads | `questionnaireUploads` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| remote-sessions | `remote-sessions` | Remote Audit | Transaction | Mutable | Non-versioned | Remote session management |
| report-instances | `report-instances` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| report-templates | `report-templates` | Template Library | Master | Mutable | Non-versioned | Report templates |
| request_id_counters | `request_id_counters` | Operational Workflow | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| ScheduleEventLog | `scheduleeventlogs` | Scheduling | Transaction | Append-only | Non-versioned | Schedule event log |
| ScheduleSlot | `scheduleslots` | Scheduling | Transaction | Mutable | Non-versioned | Schedule slot proposal |
| sequence_counters | `sequence_counters` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| status-definitions | `status-definitions` | Workflow Reference | Master | Mutable | Non-versioned | Status code definitions |
| status-history | `status-histories` | Workflow Tracking | Transaction | Append-only | Non-versioned | Status transition history |
| status-trackers | `status-trackers` | Workflow Tracking | Transaction | Mutable | Non-versioned | Current status projection |
| subscriptions | `subscriptions` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| supplier-master-products | `supplier-master-products` | Supplier Catalog | Master | Mutable | Non-versioned | Legacy supplier product master |
| supplier-network-links | `supplier-network-links` | Unclassified/Reference | Master | Mutable | Non-versioned | Needs explicit domain decision during kernel design |
| supplier-profiles | `supplier-profiles` | Identity/Profile | Master | Mutable | Non-versioned | Supplier admin profile extension |
| supplier-public-signals | `supplier-public-signals` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| supplier-risk-events | `supplier-risk-events` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| supplier-risk-metrics | `supplier-risk-metrics` | Event/Snapshot | Transaction | Mutable | Non-versioned | Analytical classification based on naming |
| supplier-risk-snapshots | `supplier-risk-snapshots` | Event/Snapshot | Transaction | Append-only | Non-versioned | Analytical classification based on naming |
| supplier-sites | `supplier-sites` | Supplier Directory | Master | Mutable | Non-versioned | Supplier site master data |
| supplier-user-profiles | `supplier-user-profiles` | Identity/Profile | Master | Mutable | Non-versioned | Supplier subordinate profile extension |
| supplier_product_claims_v2 | `supplier_product_claims_v2` | Marketplace | Transaction | Mutable | Non-versioned | Supplier claim against canonical product |
| supplier_product_offers_v2 | `supplier_product_offers_v2` | Marketplace | Transaction | Mutable | Non-versioned | Supplier commercial offer |
| supplier_product_site_links_v2 | `supplier_product_site_links_v2` | Marketplace | Transaction | Mutable | Non-versioned | Supplier product-to-site link |
| SystemSetting | `systemsettings` | Platform Config | Master | Mutable | Non-versioned | System settings |
| table_variants | `table_variants` | User/UX Config | Master | Mutable | Non-versioned | Saved table variants |
| templateQuestions | `templateQuestions` | Template Library | Master | Mutable | Non-versioned | Question library rows |
| templates | `templates` | Template Library | Master | Mutable | Non-versioned | Questionnaire/report template headers |
| Tenant | `tenants` | Identity/Tenancy | Master | Mutable | Non-versioned | Reference/administrative tenant record |
| tenant-module-configs | `tenant-module-configs` | Capability/Feature Config | Master | Mutable | Non-versioned | Per-tenant module entitlements |
| trust_badges | `trust_badges` | Reference/Config | Master | Mutable | Non-versioned | Analytical classification based on naming |
| UserNotificationPreference | `user_notification_preferences` | Reference/Config | Master | Mutable | Non-versioned | Analytical classification based on naming |
| users | `users` | Identity/Access | Master | Mutable | Non-versioned | Application user account |
| workflow_milestone_definitions | `workflow_milestone_definitions` | Workflow Reference | Master | Mutable | Non-versioned | Milestone definitions |
| workflow_milestone_instances | `workflow_milestone_instances` | Workflow Tracking | Transaction | Mutable | Non-versioned | Milestone runtime instances |
| workflow_sla_configs | `workflow_sla_configs` | Workflow Reference | Master | Mutable | Non-versioned | SLA configuration |

## Observations
- The current platform mixes master and transaction concerns inside a few large collections, especially `audit-requests-master` and `auditQuestions`.
- Evidence is split between audit-native transaction records and document-vault style reusable records.
- Tracking state is stored both as transaction projections and as embedded state on operational documents.
- Marketplace V2 already uses a more normalized master/claim/offer/site-link pattern than the legacy audit side.
