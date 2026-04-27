# PII Redaction Proxy — Standalone Service

> **Hybrid deployment companion.** Runs in customer's VPC, intercepts every LLM call,
> redacts sensitive data before it reaches the cloud LLM, and un-redacts the response
> before it returns to the Hawkeye runtime.
>
> **Status: REFERENCE IMPLEMENTATION + PRODUCTION CHECKLIST.** The Express app below
> is a working stub; production-grade requires the redaction-rule library, the
> reversible-token store, and customer-CISO sign-off on the rule set.

## Why this exists

For Hybrid deployments (Doc 3 §4), the customer's CISO has stated: *"No PHI/PII may
leave our VPC."* The PII proxy sits between Hawkeye's serverless runtime and the cloud LLM.

```
Hawkeye SaaS  →  prompts  →  PII PROXY (in customer VPC)  →  redacted prompts  →  Cloud LLM
                              ↓                                                         ↓
                              audit log                                                response
                              token store ←—————————————————————— un-redacted ——————————┘
```

## What gets redacted

The default rule library (`rules/default.js`) covers:

- **Patient identifiers**: names, MRNs, DOBs, SSNs (US), Aadhaar (India), NHS numbers (UK)
- **Lot numbers** matching customer-supplied regex
- **Supplier business secrets** matching customer-supplied dictionary
- **Financial figures** above customer-supplied threshold
- **Email addresses** outside customer-supplied allow-list
- **API keys / credentials** matching common patterns

Each redacted value is replaced with a stable token (e.g., `[NAME_a3f9c1]`) and stored
in the **reversible-token store** (Redis) with a 30-minute TTL.

When the LLM response comes back, the proxy un-redacts the tokens before returning to
Hawkeye, so the user sees real names, not `[NAME_a3f9c1]`.

## Deployment

**Infrastructure**: One Node.js service per customer VPC. Recommended: AWS Fargate or
Azure Container Apps with auto-scaling.

**Egress**: Restricted allow-list — only the LLM provider endpoints (api.anthropic.com,
generativelanguage.googleapis.com, etc.).

**Audit log**: Every redaction event written to customer-side log store (e.g., CloudWatch,
Splunk, ELK). The customer's CISO can audit every prompt that left their VPC.

## Env contract

```
PII_PROXY_LISTEN_PORT=8443
PII_PROXY_TLS_CERT_PATH=/secrets/proxy-cert.pem
PII_PROXY_TLS_KEY_PATH=/secrets/proxy-key.pem
PII_PROXY_REDIS_URL=redis://redis.internal:6379
PII_PROXY_LLM_PROVIDERS=anthropic,gemini      # which upstreams to allow
PII_PROXY_RULE_SET=/config/redaction-rules.json
PII_PROXY_AUDIT_LOG_PATH=/var/log/pii-proxy/audit.jsonl
PII_PROXY_HAWKEYE_API_KEY=<shared secret>     # to authenticate upstream Hawkeye calls
```

## Production checklist

Before customer go-live:

- [ ] Customer CISO reviews + signs off on the rule set
- [ ] Pen-test the proxy (especially the un-redaction path — token-store leakage)
- [ ] Token store has memory-only mode for highest-trust customers (no Redis persistence)
- [ ] All TLS endpoints have customer-managed certs
- [ ] Audit log integration tested with customer's SIEM
- [ ] Rate-limit + back-pressure to prevent prompt-injection of huge payloads
- [ ] Monitor for redaction-rule false negatives (sample-and-review process)

## Files

- [server.js](server.js) — Express app entry point
- [redactor.js](redactor.js) — pure-function redaction with rule library
- [tokenStore.js](tokenStore.js) — reversible-token store (Redis-backed)
- [rules/default.js](rules/default.js) — default redaction rule library
- [package.json](package.json) — minimal deps (express, redis, fs)
