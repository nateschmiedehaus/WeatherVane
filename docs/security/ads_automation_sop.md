# Ads Automation Security SOP

## Objective
Codify the operational controls required to launch Meta and Google ads automation safely. The SOP aligns allocator critics, security reviewers, and product engineering so each automation slice ships with auditable evidence and clear incident playbooks.

## Scope
- Applies to all automation flows that create, update, or pause paid media campaigns via Meta Marketing API or Google Ads API.
- Covers credential lifecycle, environment segregation, monitoring, and incident response for both channel integrations.

## Roles & Responsibilities
- **Atlas (Product)** – Implements automation features, integrates telemetry, and ensures the UI respects capability toggles defined in `docs/api/ads_capability_matrix.md`.
- **Security Steward** – Owns secret management policy, audits credential storage, and reviews compliance logs.
- **Director Dana** – Approves new tenant enablement after verifying evidence packets from Product and Security.
- **Allocator Critic** – Consumes telemetry to confirm rate-limit compliance, budget guardrails, and error handling.

## Pre-flight Checklist
1. **Tenant Vetting**
   - Collect Business Manager ID (Meta) and Customer ID (Google) during onboarding.
   - Verify vertical classification; route sensitive categories (financial, housing, politics, healthcare) to legal for explicit written approval.
2. **Credential Provisioning**
   - Meta: Generate a system user under the verified Business Manager, limit permissions to `ads_read`, `ads_management`, `business_management`. Store the long-lived token in HashiCorp Vault under `ads-automation/<tenant>/meta`.
   - Google: Request developer token approval (basic tier) mapped to the WeatherVane MCC. Generate per-tenant OAuth client, storing refresh token in Vault under `ads-automation/<tenant>/google`.
   - Tag each secret with rotation date and vertical classification metadata.
3. **Environment Segregation**
   - Separate service accounts for staging vs production. Production integrations operate from locked-down IP allowlists and dedicated workers.
   - Disable credential reuse across tenants; each tenant receives unique tokens even if they share an agency.
4. **Access Reviews**
   - Quarterly entitlement review: confirm only delegated automation workers and security auditors can read secrets.
   - Log approvals in `state/analytics/consensus_workload.json` as consensus task `SEC-AUDIT-AUTOMATION`.

## Runtime Controls
- **Request Signing & Logging** – Persist vendor request IDs, payload hashes, and response codes to `state/telemetry/usage.jsonl`. Include tenant ID and acting user for traceability.
- **Rate Limit Backoff** – Implement exponential backoff for Meta and `Retry-After` compliance for Google. Bubble partial failures back to allocator diagnostics with actionable messaging.
- **Budget Safety Nets** – Enforce max daily budget deltas (default ≤ 25%) and block campaigns flagged as learning-limited until allocator critic revalidates projections.
- **Creative Review Surfacing** – Surface policy review status (pending, approved, rejected) in the UI and alert via Ops Slack channel for rejections on regulated categories.
- **Rotation Automation** – Nightly cron refreshes Meta tokens; weekly refresh for Google OAuth. Any refresh failure triggers PagerDuty `Ads-Automation-Rotation`.

## Incident Response
1. Freeze automation toggles for the affected tenant (feature flag `adsAutomationEnabled`).
2. Revoke associated credentials in Vault and vendor console.
3. Gather request logs for the past 48 hours and escalate to Security Steward and Director Dana.
4. File a post-incident record in `docs/security/context7.md` including root cause, blast radius, and remediation steps.

## Audit Evidence & Handoff
- Automation slice cannot exit until:
  - Capability matrix and compliance artifact (`state/artifacts/research/ads_api_compliance.json`) are up to date.
  - Rotation jobs documented with runbooks (append to `docs/AUTOPILOT_RUNBOOK.md`).
  - Security Steward signs off in consensus tooling; log decision ID in `state/context.md`.
- Maintain change log entries whenever tenant access is granted or revoked; attach evidence when running `plan_update` for roadmap tasks.
