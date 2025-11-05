# Strategy – Task 11 MODULE-INDEX (2025-11-05)

## Why this matters now
- Wave 1/2 work left module ownership inconsistent; many directories still lack OWNERS/metadata, preventing guardrail automation from enforcing stewardship policy.
- Upcoming tasks (entropy, variety, resilience) require a canonical module registry to relate ownership, TTLs, dependencies, and health signals. Without a machine-readable `module_index`, we cannot compute cross-module metrics or enforce TTL alerts.
- User directives explicitly call out module stewardship as part of the autonomous programming unit vision; completing this unlocks the governance and monitoring loops needed for Wave 4/5.

## Current availability
- Some directories already have partial OWNERS files, but there is no central registry and no automated validation. Existing scripts check ownership/TTLs piecemeal.
- No single source lists module IDs, paths, dependencies, TTL dates, or health flags.

## Strategic approach
1. Inventory top-level modules (apps/api, tools/wvo_mcp, docs, state, meta, etc.) along with any nested domains requiring explicit stewardship (per user instructions: orchestrator, executor, intelligence, critics, etc.).
2. Define schema for `meta/module_index.yaml` covering module id, path, description, stewards, reviewers, TTL metadata, health signals, dependencies, and status.
3. Implement generation script to derive index from distributed `OWNERS.yaml` & `module.yaml` files (ensuring they exist/created as part of Task 10). Since Task 10 may be outstanding, ensure generation gracefully handles missing data and can be rerun once stewardship files land.
4. Provide validation script (schema enforcement + TTL expiry warnings) and evidence (CLI output, JSON).
5. Build optional dashboard/report hooking into future topology tasks.

## Dependencies & coordination
- Relies on Task 10 (backfill OWNERS/module files). If missing, we may need to scaffold minimal entries for directories touched. Without them module index still possible by creating required files in this task (per acceptance, we likely need to create them now).
- Task 12 (topology) will consume the module index output; plan should produce data in format easily convertable to graph.

## Kill triggers
- If we cannot get reliable steward data (e.g., user-defined lists missing), abort and coordinate with Task 10 simultaneously. Current instructions allow us to author OWNERS/module files as part of stewardship obligations.

## Success criteria
- `meta/module_index.yaml` present with entries for each top-level domain.
- Generation script & validation script pass on repo state.
- Evidence includes generated index snapshot and validation log.

