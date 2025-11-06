# Think: AFP-MODULE-REMEDIATION-20251105-C

## Edge Cases & Risks
- **Missing live flags**: Feature gates must tolerate absent keys and fall back to sensible defaults (compact prompts, legacy scheduler, no sandbox pool) without throwing.
- **Boolean parsing**: Live flags arrive as strings; normalize (`1/0`, `true/false`, `enabled`) consistently to avoid misfires.
- **Numeric gates**: Research sensitivity / critic intelligence require graceful parsing with guardrails (clamp within range).
- **Auth detection**: Avoid false negatives by checking both environment paths and `state/accounts.yaml`; log guidance when neither present.
- **Runtime imports**: Replace `.js` shims with extensionless imports to keep TypeScript + runtime aligned after compilation.

## AFP / SCAS Alignment
- **Via negativa**: Implement lean facades (FeatureGates/AuthChecker) instead of replicating complex legacy logic; remove redundant shim files.
- **Micro-batching**: Confine changes to the gated modules, related tests, and minimal touch points; stay well under 150 LOC per file.
- **Locality**: Keep feature gating in orchestrator module, auth helper in utils, and update call sites locally.
- **Safety**: Default to conservative behaviour (disable risky features when flags absent, treat auth as required) to prevent silent regressions.
