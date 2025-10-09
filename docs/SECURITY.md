# Secrets & Access Hardening Plan

This document tracks the remaining work to migrate WeatherVane secrets into a managed vault and tighten
credential rotation. It complements the Phase 7 roadmap items.

## Current state
- Connector credentials (Shopify, Meta, Google Ads, Klaviyo) live in local `.env` files or environment
  variables injected by CI/CD.
- `python apps/worker/maintenance/secrets.py` (or `make check-secrets`) validates that required secrets are
  present for local runs and CI.

## Migration goals
1. **Vault selection** – choose HashiCorp Vault or cloud-native secret manager (AWS/GCP/Azure).
2. **Secret sync** – move Shopify/Meta/Google tokens into the vault, expose read-only app roles for worker/API.
3. **Rotation hooks** – document/token refresh cadence (Shopify manual, Meta long-lived token, Google OAuth
   refresh). Automate notifications when tokens expire.
4. **CI integration** – update pipelines to fetch secrets at runtime (no `.env` upload). Add `make check-secrets`
   as a pre-flight step.
5. **Audit & logging** – enable vault audit trail; log secret fetch failures via observability stack.

## Action items
- [ ] Draft architecture diagram showing worker/API access to the vault.
- [ ] Prototype vault lookup helper and replace direct `os.getenv` for connectors.
- [ ] Update deployment manifests with vault annotations (Kubernetes secrets sidecar or workload identity).
- [ ] Add rotation calendar to ops runbook and automate reminders.
- [ ] Update `docs/OBS_ALERTS.md` with alerts for token nearing expiration.

## Timeline
- **Week 1**: finalize vault choice, draft architecture, update runbooks.
- **Week 2**: implement lookup helper, integrate with worker/api services.
- **Week 3**: migrate secrets, update CI/CD, enable alerts.

## References
- Phase 7 entries in `docs/ROADMAP.md`
- Observability runbooks (`docs/OBS_ALERTS.md`, `docs/runbooks/observability.md`)
