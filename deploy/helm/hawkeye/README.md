# Hawkeye On-Prem Helm Chart — Skeleton

> **Status: REFERENCE ARCHITECTURE.** This Helm chart deploys Hawkeye into a customer's
> Kubernetes cluster (airgapped or restricted-egress). It is **a template + reference**,
> not a turnkey production install — every customer environment varies.
>
> Estimated 2-3 weeks of customer-IT engagement to harden + validate per environment.

## What this chart deploys

| Component | Replicas | Purpose |
|---|---|---|
| `hawkeye-api`         | 2-3   | Node/Express backend (the same code that runs on Vercel SaaS) |
| `hawkeye-web`         | 2     | Next.js frontend (SSR-capable) |
| `hawkeye-cron`        | 1     | Scheduled jobs (OVERDUE scan, EXPIRE scan, monthly scorecards) |
| `mongodb`             | 3     | (optional) Mongo replica set if customer doesn't BYO DB |
| `vllm` (optional)     | 1+    | On-prem LLM serving — Llama 3.1 70B / Mixtral / Qwen 2.5 |
| `qdrant` (optional)   | 1     | Vector store for RAG retrieval |
| `pii-proxy` (Hybrid)  | 2     | Redaction proxy if customer wants Hybrid-style egress filtering |

## What's in this directory

- [Chart.yaml](Chart.yaml) — chart metadata
- [values.yaml](values.yaml) — full configurable values with defaults + comments
- [templates/](templates/) — Kubernetes manifests:
  - `deployment-api.yaml`
  - `deployment-web.yaml`
  - `deployment-cron.yaml`
  - `deployment-vllm.yaml` (optional, behind `vllm.enabled`)
  - `service-*.yaml`
  - `ingress.yaml`
  - `configmap.yaml`
  - `secret-template.yaml` (use real secrets manager in production)
  - `pvc-storage.yaml`

## Deployment to a customer cluster

### 1. Prerequisites

- Kubernetes 1.27+ (EKS / AKS / GKE / OpenShift / on-prem)
- Helm 3.12+
- A namespace (e.g., `hawkeye`)
- Persistent storage class for MongoDB (if not BYO)
- (Optional) NVIDIA GPU operator + at least 1× A100 80GB if using on-prem LLM
- (Optional) Cert-manager for TLS

### 2. Install

```bash
# Pull the chart artifact (Hawkeye-signed)
helm pull oci://registry.hawkeye.app/charts/hawkeye --version 1.0.0
tar -xzf hawkeye-1.0.0.tgz

# Customize values
cp hawkeye/values.yaml my-values.yaml
$EDITOR my-values.yaml

# Install
kubectl create namespace hawkeye
helm install hawkeye ./hawkeye -n hawkeye -f my-values.yaml
```

### 3. Verify

```bash
kubectl get pods -n hawkeye
kubectl logs -l app=hawkeye-api -n hawkeye --tail=50

# Hit the health endpoint
kubectl port-forward svc/hawkeye-api 3000:80 -n hawkeye
curl http://localhost:3000/api/health
```

### 4. Initialize tenant data

```bash
# Run the seed script via a one-shot Job
kubectl exec -it deploy/hawkeye-api -n hawkeye -- node scripts/seed-audit-only-users.mjs
```

## On-prem LLM configuration

If `vllm.enabled: true`, the chart deploys a vLLM serving container with the
configured model. Hawkeye API is configured to route LLM calls to the in-cluster
endpoint via env var `LLM_PROVIDER=local` and `LLM_LOCAL_URL=http://hawkeye-vllm:8000`.

**Recommended models** (one of):
- `llama-3.1-70b-instruct` — best general-purpose, fits on 2× A100 80GB
- `mixtral-8x22b-instruct` — strong reasoning, fits on 2× A100 80GB
- `qwen-2.5-72b-instruct` — best for China/Asia regulatory text

See `values.yaml` → `vllm.model` to choose.

## Hybrid deployment (PII proxy)

If `piiProxy.enabled: true`, the chart additionally deploys the standalone PII
proxy from `deploy/pii-proxy/`. Hawkeye API is then configured to route LLM calls
through the proxy instead of directly to the cloud LLM. This keeps PHI/PII inside
the customer's VPC even when using cloud LLMs.

## Updating

```bash
helm upgrade hawkeye ./hawkeye -n hawkeye -f my-values.yaml
```

The chart applies a rolling update. No downtime for the API/web tier (assuming
≥2 replicas). Cron is briefly interrupted.

## Production checklist

Before customer go-live:

- [ ] Replace inline secrets with external secrets manager (AWS Secrets Manager,
      HashiCorp Vault, Azure Key Vault) — see `secret-template.yaml`
- [ ] Configure `imagePullSecrets` for Hawkeye's signed registry
- [ ] Set MongoDB to use customer-managed encryption keys (CMK) or BYO-DB
- [ ] Configure ingress TLS with customer's certs (or cert-manager + Let's Encrypt for non-airgap)
- [ ] Tune `vllm` resource requests/limits to actual GPU availability
- [ ] Enable Pod Security Standards (`restricted` profile)
- [ ] NetworkPolicy: deny egress except allow-listed (LLM provider OR none for airgap)
- [ ] HorizontalPodAutoscaler on `hawkeye-api` based on CPU + custom metric (request queue depth)
- [ ] Backup strategy for MongoDB (Velero / cloud-native snapshots)
- [ ] Monitor with Prometheus + Grafana — Hawkeye exports `/metrics`
- [ ] Audit-log shipping to customer's SIEM
