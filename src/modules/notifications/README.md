# Notifications Module (Skeleton)

Structure:
- `models/`      — Mongoose schemas for notifications and preferences.
- `controllers/` — Express handlers for notification APIs.
- `services/`    — Business logic for emitting/dispatching notifications.
- `routes/`      — Express routers to plug into `src/app.js`.
- `templates/`   — Email/templates assets.
- `utils/`       — Helpers (formatters, channel adapters, etc.).
- `NotificationEvent.*` — Event registry constants/types.
- `index.js`     — Exposes routes/services for easy wiring.

Notes:
- Multi-tenant: include `tenant_id` on all tenant-owned documents/queries.
- This is a scaffold; add concrete implementations as needed.
