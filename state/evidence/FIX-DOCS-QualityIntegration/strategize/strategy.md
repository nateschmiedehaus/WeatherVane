# STRATEGY — FIX-DOCS-QualityIntegration (Mission 01 → Mission 02 bridge)

## 1. Why Now?
- **Autonomy mandate:** The updated Autopilot mission (“100% reliable autonomy, zero human intervention”) requires every agent to understand how quality gates, parity tooling, and the new Phase 0 instrumentation baseline interact. Current docs still talk about “future rollouts” and omit the baseline collector/checker that now exists.
- **Instrumentation dependency:** Mission 01 delivered the baseline collector/attestation scripts; without documentation, teams cannot keep the baseline healthy or interpret dashboard deltas during quality incidents.
- **Cross-agent alignment:** Claude/Codex parity tooling, follow-up enforcement, and troubleshooting guides live in different files with inconsistent language. Inconsistency creates drift and slows incident response during capability sweeps.
- **Blocking upcoming work:** Mission 02 (structural graph + automation) assumes operators can self-serve quality telemetry. If documentation lags, we reintroduce human checkpoints, undermining autonomy progress.

## 2. What’s the Real Problem?
- **Fragmented story:** Each doc covers a slice (enforcement CLI, parity, troubleshooting), but none explains the end-to-end quality system (rollout → telemetry → parity → remediation). Readers must stitch information manually.
- **Outdated frames:** Legacy wording still assumes quality integration is optional; it doesn’t stress “fix now” loopbacks, baseline freshness, or autopilot-first execution.
- **Missing mission hooks:** The docs rarely reference autonomy KPIs, causing teams to treat quality gates as compliance rather than as the safety system that unlocks full autonomy.

## 3. Reframed Goals
1. **Tell the unified quality narrative**—from STRATEGIZE evidence requirements through baseline instrumentation and parity sweeps—so any agent can diagnose and resolve issues in-loop.
2. **Embed instrumentation expectations**—collector/attestation commands, baseline freshness checks, and dashboard consumption—into the same places operators already look.
3. **Codify escalation + remediation** processes tied to autonomy KPIs (baseline gaps, override thresholds, parity drift) to prevent follow-up debt.

## 4. Option Exploration
| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A. Minimal edits | Patch wording in existing sections | Fast; low risk | Continues fragmented story; instrumentation remains tribal knowledge |
| B. Targeted refresh (preferred) | Rewrite key sections with autonomy/instrumentation framing; add cross-links & command tables | Aligns with mission, keeps docs lean, leverages existing structure | Requires careful narrative weaving across multiple files |
| C. New “quality handbook” doc | Centralise everything in a new document | Single source of truth | Duplication risk; existing readers rely on CLAUDE.md/WORK_PROCESS.md |
| D. Tooltips-only update | Update CLI help output instead of docs | Immediate feedback in terminal | Loses long-form guidance (process, escalation, mission linkage) |

We choose **Option B**: refresh existing canonical docs so the workflow remains discoverable where agents already operate, while tying every step back to autonomy metrics and the instrumentation baseline.

## 5. Strategic Approach
- **Anchor on mission:** Start each updated section with autonomy framing; explicitly connect enforcement + baseline health to the autonomy KPI.
- **Integrate instrumentation:** Document collector/attestation usage, baseline evidence paths, and status surfaces (enforcement dashboard, tmux status line) alongside parity/capability tools.
- **Clarify loopbacks:** Highlight zero-deferral rules, override protocols, and escalation triggers with concrete commands + evidence expectations.
- **Cross-link aggressively:** Ensure CLAUDE.md, WORK_PROCESS.md, README, and troubleshooting guide reference each other and Phase 0 instrumentation for quick navigation.

## 6. Success Signals
- Docs mention baseline collector (`collect_phase0_baseline.mjs`), checker, and evidence paths in relevant sections.
- Autonomy framing visible in each target doc, including explicit “fix now” guidance tied to mission metrics.
- Troubleshooting guide covers parity drift, baseline gaps, override usage, and instrumentation alerts.
- Verification shows updated docs + lint (if applicable) and roadmap metadata acknowledges completed work.

## 7. Kill / Pivot Triggers
- If documentation scope balloons beyond the four target files, pause and create follow-up epic.
- If we discover contradictory policy info (e.g., guardrail doc outdated) that requires separate consensus, escalate before editing.

## 8. Open Questions
- Do we need an explicit quick-start snippet for new agents (maybe a checklist)? Evaluate during SPEC/PLAN.
- Should we add automation to fail if baseline older than 24h? Out of scope but capture in monitor notes if gap persists.
