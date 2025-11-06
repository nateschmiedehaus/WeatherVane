# VERIFY PLAN — AFP-OVERRIDE-ROTATION-20251106

Expected commands once implementation completes:

1. `node tools/wvo_mcp/scripts/rotate_overrides.mjs --sample state/fixtures/overrides_sample.jsonl`
   - Confirms rotation flow using fixture.
2. `npm --prefix tools/wvo_mcp run test -- --runInBand rotate-overrides`
   - Runs Vitest coverage for rotation script.
3. `npm --prefix tools/wvo_mcp run test -- process_critic`
   - Verifies ProcessCritic enforcement paths and diagnostics.
4. `node tools/wvo_mcp/scripts/run_process_critic.mjs --check overrides`
   - Ensures critic enforces rotation/audit requirements on staged changes end-to-end.

Successful output from these commands must be captured in future VERIFY phase artifacts.
