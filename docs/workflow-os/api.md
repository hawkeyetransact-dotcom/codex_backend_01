# Workflow OS API Specification (Demo)

## Auth and tenant scope
- All endpoints require `Authorization: Bearer <token>` (or auth cookie).
- Tenant-scoped endpoints require resolved `req.tenantId`.
- Common errors:
  - `400` tenant context missing / validation
  - `403` forbidden
  - `404` not found
  - `409` version/transition conflict

## 1) Workflow Definitions API

### POST `/api/workflows/definitions`
Create a definition metadata record (draft).

Request:
```json
{
  "key": "pharma_audit.standard_gmp_audit",
  "name": "Standard GMP Audit",
  "packKey": "pharma_audit",
  "description": "GMP audit baseline template"
}
```

Response `201`:
```json
{
  "success": true,
  "data": {
    "_id": "65...",
    "tenantId": "65...",
    "key": "pharma_audit.standard_gmp_audit",
    "status": "DRAFT",
    "latestVersion": 0
  }
}
```

### GET `/api/workflows/definitions?pack=pharma_audit`
List tenant definitions (filter by pack/status/search supported).

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "_id": "65...",
      "key": "pharma_audit.standard_gmp_audit",
      "name": "Standard GMP Audit",
      "status": "PUBLISHED",
      "latestVersion": 2
    }
  ]
}
```

### GET `/api/workflows/definitions/:id/versions`
List versions for a definition.

### POST `/api/workflows/definitions/:id/publish`
Create/publish a new immutable version.

Request:
```json
{
  "definition": {
    "key": "pharma_audit.standard_gmp_audit",
    "name": "Standard GMP Audit",
    "packKey": "pharma_audit",
    "version": 2,
    "startNodeId": "start",
    "nodes": [{ "id": "start", "type": "start", "name": "Start" }, { "id": "end", "type": "end", "name": "End" }],
    "edges": [{ "from": "start", "to": "end", "on": "node.completed" }]
  }
}
```

Response `201`:
```json
{
  "success": true,
  "data": {
    "definitionId": "65...",
    "versionId": "65...",
    "version": 2,
    "status": "PUBLISHED"
  }
}
```

## 2) Workflow Instance API

### POST `/api/workflows/instances`
Start instance from definition version.

Request:
```json
{
  "definitionId": "65...",
  "versionId": "65...",
  "context": {
    "auditRequestId": "65...",
    "supplierId": "65..."
  },
  "legacyRefs": {
    "auditRequestId": "65..."
  }
}
```

Response `201`:
```json
{
  "success": true,
  "data": {
    "_id": "65...",
    "status": "RUNNING",
    "currentNodeId": "supplier_response"
  }
}
```

### GET `/api/workflows/instances/:id`
Get snapshot + recent events + open tasks.

### POST `/api/workflows/instances/:id/events`
Submit event and advance runtime.

Request:
```json
{
  "eventType": "task.completed",
  "taskId": "65...",
  "payload": {
    "nonCompliantCount": 2
  }
}
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "instanceId": "65...",
    "status": "RUNNING",
    "currentNodeId": "capa_loop",
    "appliedEventSeq": 8
  }
}
```

## 3) Task API

### GET `/api/tasks?assignee=me`
List tasks by assignee (`me`, `user:<id>`, `role:<role>`).

### POST `/api/tasks/:id/complete`
Complete task and emit workflow event.

Request:
```json
{
  "output": {
    "approved": true,
    "notes": "Reviewed"
  }
}
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "taskId": "65...",
    "status": "COMPLETED",
    "instanceId": "65..."
  }
}
```

## 4) Document API

Note: existing legacy `/api/documents` routes are already used by document-disclosure.  
Workflow OS uses dedicated namespace:

- `POST /api/workflow-documents`
- `POST /api/workflow-documents/:id/tag`

### POST `/api/workflow-documents`
Request:
```json
{
  "instanceId": "65...",
  "sourceType": "DIGILOCKER",
  "sourceRef": "documentVersionId",
  "title": "Batch Record v3",
  "fileName": "batch-record-v3.pdf",
  "mimeType": "application/pdf",
  "tags": ["batch", "gmp", "ich-q7"],
  "linkedNodeId": "supplier_response"
}
```

### POST `/api/workflow-documents/:id/tag`
Request:
```json
{
  "tags": ["critical", "needs-review"]
}
```

## 5) Pack Registry API

### GET `/api/packs`
List available packs + tenant install status.

### POST `/api/packs/install`
Install pack for tenant (register imported definitions).

Request:
```json
{
  "packKey": "pharma_audit",
  "packVersion": "1.0.0"
}
```

### POST `/api/packs/:id/templates/import`
Import selected pack templates into `workflow_definitions`.

Request:
```json
{
  "templateKeys": ["standard_gmp_audit", "api_audit"],
  "publish": true
}
```

## Validation and error rules

### Validation
- Definition publish validates:
  - unique node ids
  - valid `startNodeId`
  - all edges point to valid nodes
  - supported node types
- Instance start validates published version availability.
- Task complete validates tenant ownership + assignee authorization.

### Standard error shape
```json
{
  "error": "Tenant context missing",
  "code": "TENANT_CONTEXT_MISSING"
}
```

