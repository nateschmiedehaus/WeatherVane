# THINK — Pre-mortem

## Scenario 1: Agents ignore quality integration instructions
- **Cause**: Docs still describe rollout as upcoming, so agents assume enforcement optional.
- **Impact**: Tasks bypass enforced checks, causing WorkProcessEnforcer violations and loops.
- **Prevention**: Update docs to clearly mark enforcement as active, link to rollout CLI, reiterate zero-skip policy.

## Scenario 2: Troubleshooting guide fails to mention audit artifacts
- **Cause**: Guide only lists commands, not where to look for evidence.
- **Impact**: Agents cannot interpret `state/analytics/enforcement_rollout.jsonl`, leading to repeated failures.
- **Prevention**: Include explicit file paths and examples in guide.

## Scenario 3: Config instructions contradict safety monitor limits
- **Cause**: README suggests manual env var edits without noting safety monitor thresholds.
- **Impact**: Operators flip to strict on almost-full disk, triggering shutdown.
- **Prevention**: Document safety monitor thresholds + recommended free-space checks (df, enforcement:status warnings).

## Scenario 4: Rollout timeline undocumented
- **Cause**: Docs omit shadow→observe→strict history; auditors can’t verify progression.
- **Impact**: Acceptance criteria fail; trust erodes.
- **Prevention**: Include concise timeline referencing audit log snapshots.
