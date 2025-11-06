# Strategy Analysis — AFP-ROADMAP-AUTONOMY-DOCSYNC-20251105

**Template Version:** 1.0  
**Date:** 2025-11-05  
**Author:** Codex (Atlas Executor)

---

## Purpose

Anchor the roadmap and structural health work on a clear "why": we must prove WeatherVane can reach **fully autonomous delivery** under AFP/SCAS guardrails while maintaining a trustworthy local knowledge base. Recent regressions (e.g., docsync over-generation, roadmap drift toward product features) show strategy debt that blocks autonomy proof.

---

## Problem Statement

**What is the actual problem we're solving?**

WeatherVane’s official roadmap (`docs/ROADMAP.md`) and operational backlog (`state/roadmap.yaml`) still emphasise traditional product phases, not the AFP autonomy journey. Agents lack a sequenced “wave” plan that gets us to 100% autonomous execution and validation, and meta guardrails to keep it on track. Simultaneously, the README automation meant to power local knowledge is under-scoped (.docsyncignore missing, loose filters), so agents re-trigger 6000+ README generations, stall commits, and lose trust.

**Who is affected by this problem?**

- **Autopilot + Atlas** — cannot focus on the autonomy bootstrapping critical path; token spend goes to low-impact product work.  
- **Director Dana / roadmap stewards** — lack visibility into AFP/SCAS priority waves, so they cannot enforce sequencing.  
- **All agents** — knowledge base churn (mass README floods, stale instructions) wastes cycles and triggers guardrail overrides.  
- **Human stakeholders** — no evidence that Autopilot can deliver diverse software tasks autonomously, undermining the “big prize.”

---

## Root Cause Analysis

1. **Roadmap drift**: `docs/ROADMAP.md` retains pre-AFP product phases (Phase 0–10) with little linkage to autonomy scaffolds. `state/roadmap.yaml` contains some AFP epics but no cohesive wave sequencing toward “Autopilot programs WeatherVane itself.”  
   - Evidence: Phase sections still prioritise marketer UX, exports, automation (see `docs/ROADMAP.md:1-200`), whereas autonomy tasks (e.g., `AFP-MVP-SUPERVISOR-SCAFFOLD`) are scattered and pending.  
2. **Missing enforcement of roadmap priorities**: AGENTS.md lacks rules to ensure wave tasks run first; agents default to backlog drift. No instruction references wave gates or autopilot proof milestones.  
3. **Docs automation guardrails incomplete**: `.docsyncignore` absent, `tools/docsync/analyzer.ts` allowlist broad → 684 READMEs (`find . -name README.md | wc -l`) and previously 6k when caches included. Guardrail logs show we had to stash huge README sets (user transcript).  
4. **Lack of structural meta-tasks**: No roadmap tasks enforce README evolution, directory audits, or autopilot meta-proof loops (e.g., testing autopilot on game/app/tool builds). Without these, we cannot demonstrate 100% reliability or self-programming ability.

Root cause: We never finished the autonomy-first roadmap rewrite or knowledge-base governance; we patched symptoms (stashing READMEs, running ad-hoc tasks) instead of codifying AFP/SCAS enforcement and staged proofs.

---

## Current State vs Desired State

**Current State**
- Roadmap doc emphasises customer product features; autopilot epics scattered (`state/roadmap.yaml` first epic “Autopilot Bootstrap” lacks wave structure and critical meta proof tasks).  
- Agents lack directive to execute wave-by-wave; AGENTS.md only covers generic AFP lifecycle.  
- README automation exists but over-broad. No `.docsyncignore`, metrics produce warnings but not used to drive tasks. Guardrails require manual overrides (pre-commit message).  
- No closed-loop evidence that Autopilot can autonomously deliver diverse software (games, tools) or maintain docs as it changes code.

**Desired State**
- Consolidated AFP “Wave Roadmap” (Wave 0…N) explicitly sequenced: autonomic foundations → guardrails → self-knowledge → autonomy proofs (multi-domain builds) → monitoring.  
- Roadmap YAML mirrors waves with dependencies, meta tasks, and exit criteria tied to autonomous proof.  
- AGENTS.md + roadmap rules enforce that wave tasks execute first; backlog tasks blocked until wave exit criteria met.  
- Docsync guardrails curated to meaningful directories; autop updates produce <100 READMEs; `.docsyncignore` controls risk; manifest drives targeted remediation tasks.  
- Processes ensure README knowledge stays fresh automatically and guardrails prevent future runaway generations.  
- Endgame tasks require autopilot to ship real programs (game, CLI tool, service) to prove capability.

**Gap Analysis**
- Strategic alignment gap: consumer roadmap vs autonomy (100% misaligned).  
- Knowledge base gap: uncontrolled README generation vs curated local KB (target ≤ 120 tracked dirs).  
- Assurance gap: no autopilot proof tasks vs requirement to prove capability (0 → 3+ major autonomy demos).  
- Governance gap: instructions/guardrails allow drift vs require wave completion first.

---

## Success Criteria

1. **Roadmap alignment** — `docs/ROADMAP.md` rewritten to wave framing with autopilot milestones; `state/roadmap.yaml` references waves with statuses (reviewed via `scripts/check_roadmap_parity.ts`).  
2. **Agent enforcement** — AGENTS.md + roadmap rules direct agents to execute wave tasks first; includes explicit blocking policy + meta task handling.  
3. **Knowledge base health** — `.docsyncignore` committed; `npm run readme:update -- --mode staged` touches ≤120 READMEs; manifest updated; `npm run readme:check` passes.  
4. **Never again guardrail** — Pre-commit or docs tooling updated so >allowed directories cannot be generated accidentally (unit tests or config).  
5. **Autonomy proof path** — roadmap includes terminal tasks requiring autopilot to deliver multi-domain software builds with metrics captured in state/analytics.

Stretch: Add CI/assertions so docsync directory count tracked (<150) and autop proof tasks feed metrics into `state/analytics/`.

---

## Impact Assessment

**Improvements if done**
- **Velocity**: Agents follow wave-critical path, reducing thrash; expect 30–50% reduction in roadmap churn measured via `state/roadmap_inbox.json`.  
- **Quality**: README knowledge base becomes trustworthy (warnings drive tasks), enabling context-light agents to ship faster.  
- **Reliability**: Autonomy proof tasks provide measurable evidence, unlocking confidence for full automation go-live.  
- **Risk reduction**: Guardrails prevent runaway staging (index.lock incidents) and ensure autop cannot spam 6k files again.  
- **Strategic**: Aligns entire organisation on “Autopilot programs WeatherVane itself” with explicit exit gates.

**If we do nothing**
- Roadmap remains product-centric; autonomy proof slips indefinitely.  
- Agents keep generating massive README diffs, triggering git failures (index.lock) and manual cleanups.  
- No audit trail proving autopilot reliability → cannot claim 100% autonomy despite time invested.  
- Knowledge base rots; directory critical evaluations ignored, causing compounding defects.

Estimate: Saves dozens of agent-hours per quarter from repeated README regenerations and roadmap misalignment; prevents future repo-lock incidents (fatal to automation).

---

## Alignment with Strategy (AFP/SCAS)

- **Via Negativa / Economy**: Deletes product-first clutter from roadmap; prunes docsync scope to meaningful directories; prevents redundant READMEs.  
- **Refactor not Repair**: We restructure roadmap & guardrails at root, rather than patching symptoms (e.g., manual stash instructions).  
- **Coherence & Locality**: Roadmap waves cluster related autonomy work; docsync enforce only key modules; README evaluations connect upstream/downstream to reduce scattering.  
- **Visibility & Evolution**: README critical evaluations surface structural issues; roadmap waves add meta tasks for continual improvement (monitoring, audits).  
- **Success Cascade**: Each wave feeds metrics into state/analytics, ensuring we can prove readiness before advancing.

This task directly supports AFP goal: resilient, self-improving automation with controlled complexity and transparent evolution.
- ✅ REFACTORING: "Address root cause: no enforcement mechanism. Create systematic solution similar to proven DesignReviewer pattern."

**Complexity Control:**
[Does this increase or decrease system complexity? Justify.]

**Examples:**
- "Increases code complexity: +900 LOC (critic + template + scripts). Decreases cognitive complexity: clear quality bar, automated enforcement. Net: justified trade-off."

**Force Multiplier:**
[Does this amplify future value delivery?]

**Examples:**
- "Proven pattern extends to THINK phase, SPEC phase. Enables better task selection → less waste → more value per token spent. Compounds over time as agents learn from feedback."

---

## Risks and Mitigations

**What could go wrong with this task?**

[List 3-5 risks with honest assessment]

**Risk 1: [Risk description]**
- **Likelihood:** [High/Medium/Low]
- **Impact:** [High/Medium/Low]
- **Mitigation:** [How will we address this?]

**Risk 2: [Risk description]**
- **Likelihood:** [High/Medium/Low]
- **Impact:** [High/Medium/Low]
- **Mitigation:** [How will we address this?]

**Examples:**
- ❌ GENERIC: "Risk: Implementation might fail"
- ✅ SPECIFIC: "Risk: StrategyReviewer too strict → false positives → agent frustration → gaming behavior. Likelihood: Medium (DesignReviewer has ~5% false positive rate). Impact: High (erodes trust). Mitigation: Human escalation path always available, analytics track false positive rate, tune thresholds based on data."

---

## Dependencies and Constraints

**What does this task depend on?**

[List prerequisites: tools, data, other tasks, approvals]

**Examples:**
- "Depends on: Critic base class (exists: tools/wvo_mcp/src/critics/base.ts), Research layer (exists), Analytics infrastructure (exists: state/analytics/)"

**What constraints must we respect?**

[List limitations: time, budget, technical, policy]

**Examples:**
- "Constraints: Micro-batching limits (≤5 files, ≤150 LOC - will need to split into sub-tasks), Token budget (must use intelligence layer sparingly), DesignReviewer pattern (must maintain consistency)"

---

## Open Questions

**What don't we know yet?**

[List uncertainties that might affect the approach. Be honest.]

**Examples:**
- ❌ PRETENDING TO KNOW: "This will definitely work"
- ✅ HONEST: "Unknown: Will agents game the critic by writing longer but still superficial strategy docs? Mitigation: Start with semantic analysis, evolve based on analytics. Unknown: What's the right balance between strictness and flexibility? Mitigation: Monitor false positive/negative rates, tune thresholds."

**Questions:**

1. [Question 1]
2. [Question 2]
3. [Question 3]
4. [Question 4, optional]
5. [Question 5, optional]

---

## Recommendation

**Should we do this task?**

[Yes/No/Defer and why]

**Examples:**
- ❌ WEAK: "Yes, sounds good"
- ✅ STRONG: "YES - proceed immediately. Strong evidence of problem (40% compliance, 20 hours waste per cycle). Clear impact (save 20 hours + 1M tokens per cycle). Proven pattern (DesignReviewer works). High strategic value (extends to other phases). Low risk (human escalation path, analytics feedback loop)."

**If YES:**
- **Priority:** [Critical/High/Medium/Low]
- **Urgency:** [Immediate/Soon/Can wait]
- **Effort:** [Small/Medium/Large - rough estimate]

**If NO or DEFER:**
- **Why not?** [Specific reasoning]
- **What would change your mind?** [What evidence/conditions would make this worthwhile?]

---

## Notes

[Any additional context, references, or decisions made during analysis]

**References:**
- [Link to related tasks, docs, code, discussions]

**Decisions:**
- [Key decisions made during strategy phase]

---

**Strategy Complete:** [YYYY-MM-DD]
**Next Phase:** SPEC (define requirements and acceptance criteria)

---

## Anti-Patterns to Avoid

**This template should help you avoid:**
- 🚫 Jumping straight to solutions (focus on WHY and WHAT, not HOW)
- 🚫 Vague problem statements ("improve quality" vs specific evidence)
- 🚫 Shallow root cause analysis (stopping at symptoms)
- 🚫 Unmeasurable success criteria ("better" vs quantified targets)
- 🚫 Generic risk assessment (specific risks with likelihood/impact)
- 🚫 Missing evidence (claims without supporting data)
- 🚫 Solution bias (starting with "we need X tool" vs "we need to achieve Y outcome")

**Remember:** Strategy is about THINKING, not TYPING. If your strategy.md is < 30 lines, you probably haven't thought deeply enough.
