# SAML / OIDC Integration — Skeleton

> **Status: SKELETON.** This directory contains the integration plan + env-var contract.
> Production integration requires installing `@node-saml/passport-saml` and wiring per-tenant
> IdP metadata. Estimated 1-2 weeks for a competent backend engineer once a customer
> has provided their IdP metadata.

## Why this is skeleton-only

Real SAML SSO needs:

1. A customer-provided IdP metadata XML (or the assertion-consumer-service URL + cert)
2. Per-tenant configuration (Hawkeye supports multiple SAML IdPs simultaneously)
3. JIT user provisioning rules (which user attributes map to Hawkeye role)
4. SAML library installation + wiring
5. Production crypto (signing certs in a KMS, not env vars)
6. SOC 2-grade audit logging of SAML auth events

I've shipped the **contract** (env vars, route shape, identity-mapping interface) so a developer
can complete the integration without re-designing the surface area.

## How to complete the integration

### 1. Install the library

```bash
cd backend
npm install @node-saml/passport-saml passport
```

### 2. Configure per-tenant in MongoDB

Add a `saml-config` collection (one row per tenant that has SAML enabled):

```javascript
{
  tenantId: "acme-pharma-audit",
  idpEntityId: "https://idp.customer.com/saml",
  ssoUrl: "https://idp.customer.com/sso",
  cert: "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  attributeMapping: {
    email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    firstName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    lastName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    role: "https://hawkeye.app/claims/role"
  },
  jitProvisioning: { enabled: true, defaultRole: "buyer" },
  signRequests: true,
  enabled: true
}
```

### 3. Wire the strategy in `src/auth/saml/strategy.js`

Use the `samlStrategyForTenant()` factory below — it reads the config from
MongoDB at request time so each tenant's SAML setup is independent.

### 4. Mount routes

```javascript
// src/app.js
import samlRoutes from "./auth/saml/routes.js";
app.use("/api/auth/saml", samlRoutes);
```

The routes are:
- `GET  /api/auth/saml/:tenantId/login` — initiate SAML AuthnRequest
- `POST /api/auth/saml/:tenantId/acs`   — Assertion Consumer Service callback
- `GET  /api/auth/saml/:tenantId/metadata` — service-provider metadata XML

### 5. Test with mock IdP

For local dev, use [`samltest.id`](https://samltest.id/) or `samling`. Document the
test setup in `docs/06-go-to-market/03-deployment-models.md`.

## Env contract (set in customer's deployment)

```
SAML_HOST=https://hawkeye.app                  # used to construct SP entity ID
SAML_SP_PRIVATE_KEY_PATH=/secrets/sp-key.pem   # SP signing key (sealed)
SAML_SP_CERT_PATH=/secrets/sp-cert.pem
SAML_LOGOUT_URL=https://hawkeye.app/login      # where to send users post-logout
```

## OIDC variant

OIDC is similar but simpler — use `openid-client` instead of `@node-saml/passport-saml`.
The route contract becomes:
- `GET  /api/auth/oidc/:tenantId/login`
- `GET  /api/auth/oidc/:tenantId/callback`

## Audit logging requirement

Every SAML auth event MUST write to `audit-trails` (universal log) with:
- `action: "SSO_LOGIN"`
- `entityType: "user"`
- `entityId: <userId>`
- `metadata: { idp, tenantId, samlSessionIndex }`
- `ip` + `userAgent`

This is required for SOC 2 audit and customer security reviews.

## Files in this skeleton

- [strategy.js](strategy.js) — `samlStrategyForTenant(tenantId)` factory (commented stub)
- [routes.js](routes.js) — Express routes with TODO markers
- [README.md](README.md) — this doc
