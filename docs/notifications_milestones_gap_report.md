# Notifications & Milestones Model Gap Report

## Notification Models

### src/modules/notifications/models/notificationModel.js
Fields: tenantId, recipientUserId, recipientRole, type, severity, title, message, entityType, entityId, action {label,url}, channels, isRead, readAt, snoozedUntil, expiresAt, isDeleted, idempotencyKey, createdAt/updatedAt.
Indexes: (tenantId, recipientUserId, isRead, createdAt desc), (tenantId, type, createdAt desc), idempotencyKey index.
Missing vs required: action.label/url present; snoozedUntil/expiresAt present; OK. (expiresAt/lastNotifiedAt not used in queries).

### src/modules/notifications/models/notificationPreferenceModel.js
Fields: tenantId, userId (unique), channels {inApp,email}, digestMode, doNotDisturb {startTime,endTime}, mutedTypes, minimumSeverity, createdAt/updatedAt.
Indexes: userId unique, tenantId index.
Missing: none for preferences.

### src/modules/notifications/models/notificationDeliveryLogModel.js
Fields: tenantId, notificationId, channel, status (sent/failed), error, metadata, createdAt/updatedAt.
Indexes: tenantId (implicit), notificationId (implicit via ref) – no compound index.
Missing: status/timestamps index for retries; tenantId compound index would help querying by tenant/channel/status.

### Legacy src/models/notificationModel.js
Older duplicate (tenantId?, type?, etc.) — should be deprecated in favor of modules/notifications version.

## Milestone Models

### src/models/workflowMilestoneDefinitionModel.js
Fields: tenantId, workflowType ("AUDIT"), code, name, description, order, defaultResponsibleRole, defaultDurationHours, isActive, createdAt/updatedAt.
Indexes: (tenantId, workflowType, code) unique.
Missing vs required: matches required list.

### src/models/workflowMilestoneInstanceModel.js
Fields: tenantId, workflowType, workflowEntityType ("AuditRequest"), workflowEntityId, milestoneCode, status, responsibleUserId, responsibleRole, expectedAt, startedAt, completedAt, isOverdue, lastNotifiedAt, metadata, createdAt/updatedAt.
Indexes: (tenantId, workflowEntityId, milestoneCode) unique; (tenantId, expectedAt, status).
Missing vs required: matches required; consider index on (tenantId, status, expectedAt) for overdue scans (current index covers expectedAt/status but not sort by tenantId first).

### src/models/workflowSlaConfigModel.js
Fields: tenantId, workflowType, milestoneCode, durationHours, escalation[{afterHours, notifyRoles[], severity, channels[]}], allowUserOverride, createdAt/updatedAt.
Indexes: (tenantId, workflowType, milestoneCode) unique.
Missing vs required: matches required list.

## Other workflow/status tracking
- AuditRequestMaster (not fully enumerated here) holds trackStatus/questionnaireStatus etc.; no dedicated workflow event model.

## Index Gaps / Overdue Scans
- NotificationDeliveryLog: add index (tenantId, status, channel, createdAt) for pending/failed retries.
- WorkflowMilestoneInstance: current index (tenantId, expectedAt, status) would be ideal; we have (tenantId, expectedAt, status) partially via (tenantId, expectedAt, status:1) but currently defined as (tenantId, expectedAt, status:1) indirectly — recommended explicit compound (tenantId, status, expectedAt) to support queries by tenant + overdue status.

## Required vs Missing Fields Summary
- Notification: all required fields present; no gaps.
- Milestone definitions: all required fields present.
- Milestone instances: required fields present; add (tenantId, status, expectedAt) index.
- SLA: required fields present.

