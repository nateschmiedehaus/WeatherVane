# Spec – Task 11 MODULE-INDEX

## Deliverables
- `meta/module_index.yaml` containing entries for all top-level modules and key submodules (agents/orchestrator/executor/intelligence/critics/docs/state/meta/apps, etc.)
- Generation script `tools/wvo_mcp/scripts/generate_module_index.ts` that scans directories, reads `OWNERS.yaml` + `module.yaml`, and produces the index deterministically.
- Validation script `tools/wvo_mcp/scripts/validate_module_index.ts` ensuring schema conformity, TTL freshness, and dependency references to existing modules.
- Optional JSON schema `meta/module_index.schema.json` for validation.
- Evidence: generated YAML snapshot + validation CLI output.

## Scope & Approach
1. **Data model**
   ```yaml
   module:
     id: orchestrator
     path: tools/wvo_mcp/src/orchestrator
     description: Task planning and execution control
     stewards:
       - Atlas
     reviewers:
       - Council
     ttl_days: 90
     last_review: 2025-11-05
     next_review: 2026-02-03
     health_signals:
       - build_passes
       - tests_pass
       - no_open_guardrail_violations
     dependencies:
       - executor
       - critics
     health_status: healthy | warning | critical
   ```

2. **Generation logic**
   - Identify module directories via configuration map (proto version) plus dynamic discovery (first-level under apps/, tools/wvo_mcp/src/, docs/, state/, meta/).
   - For each directory: ensure `OWNERS.yaml` and `module.yaml` exist (create placeholders if missing).
   - Merge data into index (fallback defaults for TTL, stewards, etc.).

3. **Validation**
   - Check required fields present.
   - Ensure dependencies reference known module IDs.
   - TTL not expired (next_review in future); warnings recorded.

4. **Testing/Evidence**
   - Run generator & validation; capture outputs under `state/evidence/MODULE-INDEX-20251105/verify/`.

## Out of Scope
- Dashboard/topology rendering (Task 12) – leave hooks (structured data) ready.
- Full automation for TTL notifications (future work).

