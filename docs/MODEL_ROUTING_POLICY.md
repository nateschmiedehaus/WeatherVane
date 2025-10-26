# Model Routing Policy

This document explains how the Unified Autopilot discovers LLM capabilities, routes work through capability tags, and defends against stale or hard-coded model references.

## Discovery Flow

1. **Provider detection** – `model_discovery.ts` now checks only the OpenAI Codex and Anthropic Claude env keys/CLIs. Router lock rejects Google/xAI payloads up front.
2. **SDK-first fetch** – When keys and SDKs are present, the discovery service enumerates models via provider APIs, validates them against `model_catalog_schema.ts`, and applies router-lock guards so only the codex-5 and Claude 4.5/4.1 presets survive.
3. **CLI/browser login** – CLI discovery (Codex/Claude) is on by default so browser-based logins and monthly CLI subscriptions work without API keys. Set `WVO_MODEL_DISCOVERY_DISABLE_CLI=1` only when a sandbox forbids CLI execution, or override the binaries via `WVO_MODEL_DISCOVERY_CLI_OPENAI` / `WVO_MODEL_DISCOVERY_CLI_ANTHROPIC`.
4. **Vendor map fallback** – When neither SDK nor CLI discovery succeeds, the system emits vendor-map placeholders for the allow‑listed providers and records `fallback_used:<provider>` so downstream components know discovery could not run.
5. **Artifacts** – Every discovery pass writes `resources://runs/<id>/models_discovered.json` plus a repaired diff. The router prefers the most recent artifact before considering the fallback policy YAML.
6. **Browser login capture** – Successful CLI discovery records a hashed, redacted identity for the authenticated Codex/Claude session in `state/security/browser_sessions.json` so operators can audit which subscription handled the run without storing raw credentials.

## Fallback Behavior

`model_policy.yaml` (catalog_version 1) provides the minimal, validated fallback catalog. It includes routing defaults, budgets, retry ceilings, and escalation rules and intentionally avoids hard-coding specific provider SKUs beyond the placeholder entry required for bootstrapping. Whenever discovery succeeds, the router loads the artifact and ignores the fallback catalog; when discovery fails for a provider, the router logs the specific fallback note and continues with the reduced catalog.

## Capability Routing and Circuit-Breakers

`model_router.ts` converts catalog entries into capability tags (`reasoning_high`, `fast_code`, `long_context`, `cheap_batch`, etc.). Each state in the orchestration graph requests tags instead of explicit model names. The router ranks candidates by reasoning strength, code quality, context window, latency, and price class, then logs the selection via `router_decision` events.

If a provider returns HTTP 429/5xx or timeouts, the router engages a circuit-breaker for that provider (per state) for a configurable cooldown window and automatically tries the next ranked model. Verify-stage failures also increment a per-task counter; after two failures, the router forces `reasoning_high` for Implementer and requires the state graph to produce a plan delta before another attempt.

## Escalation Paths

The state graph combines router signals with Supervisor policy:

- **Verify failures** – After two consecutive verify blocks, Implementer escalates to `reasoning_high` and Supervisor enforces a new Plan.
- **Sensitive tasks** – Supervisor inspects task text for migration/auth/payment/secret keywords and triggers `policy.require_human` before moving past Specify/PR/Monitor.
- **Model throttling** – If circuit-breakers exhaust all candidates, the router surfaces an error so the Manager can pause the run or request human intervention.

## Adding a New Provider

1. Extend `PROVIDER_CONFIGS` in `model_discovery.ts` with env keys, CLI allow-list entries, and vendor map hints.
2. Add SDK or HTTP discovery logic with proper logging, repair, and journal hooks.
3. Update `model_policy.yaml` capability preferences if the provider should be preferred for certain tags (avoid naming specific models in the fallback entry).
4. Validate via the self-test harness or by running the orchestration pipeline to ensure the router emits the new provider in `router_decision` logs.
5. Document any additional ABAC requirements (e.g., CLI allowlists) in the policy controller.

## Router Lock & Compliance

`router_lock.ts` defines the single source of truth for:

- **Allowed providers** – `openai` and `anthropic` only (`ROUTER_ALLOWED_PROVIDERS`); `google`, `xai`, and `other` remain permanently banned.
- **Allowed models** – Codex fast-code presets (`codex-5-low/medium/high`) plus Claude 4.5/4.1 variants. Any catalog entries outside this set trigger errors in model discovery, registry updates, and router catalog ingestion.
- **Capability tags** – Shared arrays ensure every orchestrator state references the same capability→model mapping so the router never drifts from the lock.

`router_lock_enforcement.test.ts` now asserts that the policy YAML and router constants remain in sync (both for providers and models), and `model_registry_router_lock.test.ts` verifies that registry updates drop disallowed models before persisting them.

## Router Policy Module (Fallback Catalog)

`tools/wvo_mcp/src/orchestrator/router_policy.ts` loads `model_policy.yaml`, normalizes capability priorities, state→capability routing, and escalation thresholds, and feeds them to `ModelRouter`. When discovery artifacts are unavailable, the router now:

1. Resolves the policy path (`tools/wvo_mcp/src/orchestrator/model_policy.yaml` in-repo), or falls back to the defaults if the file is missing (e.g., in temp sandboxes).
2. Loads capability preferences (`prefer` lists) and validates them against `router_lock`.
3. Provides state-level capability mappings so agents request tags, not model names.
4. Surfaces thresholds for long-context tokens and fast-code file counts so Verify failures can escalate automatically without hard-coded constants.

The policy module also exposes helper APIs (`getBlockerProfile`, `describeEvidenceExpectation`, etc.) so the state graph and resolution engine can keep escalation logic in one place.

## Guardrails

- **Static enforcement** – `router_policy_guard.test.ts` fails if orchestrator agents hard-code provider-specific model strings outside of the discovery/router modules, and the new registry test ensures lower-level APIs honor router lock.
- **Artifacts** – Always prefer `models_discovered.json`; fall back to the YAML catalog only when discovery artifacts are missing or invalid.
- **No direct model literals** – Agents must request capability tags through `ModelRouter.pickModel` and log selections via the provided telemetry hooks; router lock enforces the capability map across the stack.
