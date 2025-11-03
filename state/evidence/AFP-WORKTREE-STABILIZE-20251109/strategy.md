# Strategy

## Context
- MCP restart failed (`tools/wvo_mcp/scripts/restart_mcp.sh` exit 2) leaving enforcement offline.
- Worktree is heavily dirty (~2k tracked/untracked paths) after previous tasks; guardrails previously prevented cleanup.
- AFP mandates restoring the enforced STRATEGIZE→AFP ALIGNMENT→…→MONITOR loop before further product changes.

## Problem Statement
We must preserve the current dirty state for later forensic analysis, reset the repo to a clean baseline rooted in `origin/main`, rebuild the MCP toolchain, and validate the AFP guard stack so future tasks can proceed safely.

## Goals
1. Capture a fully attributable snapshot (branch, tag, tarball, git notes) of the existing worktree.
2. Restore a deterministic clean baseline tied to `origin/main` and quarantine volatile artifacts.
3. Rebuild/restart the MCP toolchain, re-enabling automated AFP enforcement.
4. Repair guard/test fixtures impacted by the 10-phase AFP loop without touching product code.
5. Produce audit evidence and monitoring entries so stewards can trace the stabilization.

## Strategic Approach
- Use audit-first workflow: capture git status/diff and snapshot artifacts before modifying the tree.
- Perform cleanup via explicit authority, tagging lineage to ensure reversibility.
- Quarantine transient directories to reduce future scan noise while preserving data in `state/archive`.
- Rebuild MCP from scratch (`npm ci`, `npm run build`) so tooling re-aligns with baseline.
- Limit code edits to test fixtures/tools, focusing on AFP terminology updates and existing failing suites.
- Document every step in evidence directories and monitoring logs to satisfy AFP/SCAS stewardship.

## Alternatives Considered
- **Selective stash/apply**: rejected because it loses attribution and complicates multi-root dirty state.
- **Hard reset without snapshot**: rejected; violates auditability and could destroy unfinished work.
- **Fresh clone**: rejected; would not remediate the current repo or provide lineage for future recovery.

## Risks & Mitigations
- *Risk*: Snapshot commands fail due to path length/size. → Mitigate by using tarball + git branch/tag; monitor command output.
- *Risk*: `git clean -fdx` removes necessary config. → Mitigate via prior snapshot and verifying exclusions.
- *Risk*: MCP rebuild still fails. → Capture logs, treat as blocker, escalate with restart status in evidence.
- *Risk*: Test remediation touches product code inadvertently. → Constrain edits to `tools/wvo_mcp/src/__tests__` and similar paths; review diffs before commit.

## Success Criteria
- Evidence directory contains strategy/spec, before/after git state, MCP version, integrity logs, test outputs.
- Snapshot artifacts exist (branch, tag, tarball, git note) and are referenced in monitoring entry.
- `git status` shows clean tree post-reset.
- MCP restart script completes without fatal errors or provides actionable log recorded in evidence.
- Integrity suite and targeted tests run with captured outputs.
