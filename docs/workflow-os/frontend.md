# Workflow OS Frontend Specification

## 1) UX scope

Two UX modes are introduced:

1. First-time onboarding
- `/onboarding/use-cases`
- `/onboarding/templates`
- `/onboarding/roles`
- `/onboarding/field-mapping`

2. Ongoing workflow operations
- `/workflows/library`
- `/workflows/:id/editor`
- `/tasks`
- `/instances/:id`

## 2) Wireframes (ASCII)

### A) Use-case onboarding

```text
+-------------------------------------------------------------+
| Use Case Onboarding                                         |
| Install packs for first-time setup                          |
|                                                             |
| [Pack Card] Pharma Audit Pack      [Install] [Templates]    |
| [Pack Card] ...                                               |
+-------------------------------------------------------------+
```

### B) Template selector

```text
+-------------------------------------------------------------+
| Template Selector                                           |
| Pack: pharma_audit                                          |
| [x] Standard GMP Audit                                      |
| [x] API Audit                                               |
| [ ] PSCI SAQ                                                |
| [Import Selected] [Next: Role Mapping]                      |
+-------------------------------------------------------------+
```

### C) Workflow library

```text
+-----------------------------------------------------------------------+
| Workflow Library                                                       |
| Search [........] [Search]                                             |
|                                                                       |
| Name | Key | Pack | Status | Version | [Start] [Edit]                |
| ...                                                                   |
+-----------------------------------------------------------------------+
```

### D) Instance timeline

```text
+-----------------------------------------------------------------------+
| Workflow Instance Timeline                                            |
| Instance: ...  Status: RUNNING  Current: supplier_response           |
| [Refresh]                                                             |
|                                                                       |
| Open Tasks                                                            |
| - Complete questionnaire response      [Complete]                     |
|                                                                       |
| Events                                                                |
| #1 INSTANCE_STARTED                                                   |
| #2 NODE_ENTERED start                                                 |
| #3 NODE_COMPLETED start                                               |
| ...                                                                   |
+-----------------------------------------------------------------------+
```

## 3) Route map

| Route | Purpose | Component |
|---|---|---|
| `/onboarding/use-cases` | Pack install screen | `UseCaseOnboarding` |
| `/onboarding/templates` | Pack template import | `TemplateSelector` |
| `/onboarding/roles` | Role mapping | `RoleMapping` |
| `/onboarding/field-mapping` | Field mapping | `FieldMapping` |
| `/workflows/library` | Definition library + start | `WorkflowLibrary` |
| `/workflows/:id/editor` | JSON workflow editor + publish | `WorkflowEditor` |
| `/tasks` | Task inbox | `TaskInbox` |
| `/instances/:id` | Timeline + open tasks + events | `InstanceTimeline` |

## 4) Component tree

```text
app/(console)/onboarding/use-cases/page.tsx
  -> components/workflow-os/UseCaseOnboarding.tsx

app/(console)/onboarding/templates/page.tsx
  -> components/workflow-os/TemplateSelector.tsx

app/(console)/onboarding/roles/page.tsx
  -> components/workflow-os/RoleMapping.tsx

app/(console)/onboarding/field-mapping/page.tsx
  -> components/workflow-os/FieldMapping.tsx

app/(console)/workflows/library/page.tsx
  -> components/workflow-os/WorkflowLibrary.tsx

app/(console)/workflows/[id]/editor/page.tsx
  -> components/workflow-os/WorkflowEditor.tsx

app/(console)/tasks/page.tsx
  -> components/workflow-os/TaskInbox.tsx

app/(console)/instances/[id]/page.tsx
  -> components/workflow-os/InstanceTimeline.tsx
```

## 5) API integration plan

Client API file:
- `frontend/lib/workflowOsApi.ts`

Mapped backend APIs:
- `GET /api/packs`
- `POST /api/packs/install`
- `POST /api/packs/:id/templates/import`
- `GET /api/workflows/definitions`
- `GET /api/workflows/definitions/:id/versions`
- `POST /api/workflows/definitions/:id/publish`
- `POST /api/workflows/instances`
- `GET /api/workflows/instances/:id`
- `GET /api/tasks?assignee=me`
- `POST /api/tasks/:id/complete`

## 6) UX behavior notes

- Onboarding role/field mapping state is currently persisted in local storage for demo.
- Library and task pages are real-time against backend APIs.
- Editor is intentionally JSON-first for low-risk, reversible first release.

