# Plan: AFP-MODULE-REMEDIATION-20251105-C

## Work Plan
1. **Recon & Scope** – Identify all call sites importing `feature_gates.js`, `auth_checker.js`, and `limits/usage_estimator.js`; review existing tests to understand expected behaviours (feature gating, auth status, sandbox pooling).
2. **Design APIs** – Draft `FeatureGatesReader` helpers to map live flags to runtime decisions and define the `AuthChecker` contract (provider status, guidance, proceed helper); confirm usage estimator bridge requirements.
3. **Implement** – Add TypeScript modules (`feature_gates.ts`, `auth_checker.ts`) with deterministic defaults, update imports to extensionless form, remove obsolete `.js` stubs, and adjust dependent tests.
4. **Verify & Document** – Execute targeted Vitest suites, run TypeScript compilation, and capture AFP evidence (implement/verify/review) while updating follow-up trackers.

## Milestones
- API contracts drafted and approved.
- Modules migrated to extensionless imports with tests green.
- TypeScript build succeeds without missing-module errors tied to these utilities.

## Risks
- Existing consumers may rely on legacy behaviour; introduce compatibility helpers where needed.
- Stricter typings could surface latent bugs; allocate time for fixes.

## Verification Strategy
- `npm --prefix tools/wvo_mcp run test -- feature_gates` – ensure new feature gate helpers behave as expected.
- `npm --prefix tools/wvo_mcp run test -- ml_task_aggregator` – confirm aggregator integration respects updated interfaces.
- `npm --prefix tools/wvo_mcp run build` – TypeScript compilation must pass after refactor (acknowledge unrelated pending modules if any).
- Manual smoke: `node tools/wvo_mcp/scripts/run_process_critic.mjs --check feature-gates` (if available) to confirm ProcessCritic recognizes module changes.
