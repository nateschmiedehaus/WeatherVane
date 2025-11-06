# Design: AFP-MODULE-REMEDIATION-20251105-O

> Goal: Strengthen the `think → implement` gate so it validates earlier phase artifacts (strategy, spec, plan) alongside think/design approvals.

---

## Context
- `verifyCriticApprovals` currently enforces:
  * `strategize → spec` requires strategy critic approval.
  * `think → implement` requires think critic approval.
  * `gate → ???` requires design approval (unused due to phase set).
- This means the implementation gate only checks `think.md`, missing guarantees about strategy/spec/plan evidence. If those are missing or unreviewed, the orchestrator still proceeds.
- We should enhance gate logic to treat `implement` transition as a composite gate, ensuring upstream phases exist and have approvals recorded.

---

## Five Forces
- **Coherence**: Align gate enforcement with AFP lifecycle (phases 1-4 must be complete before implementation).
- **Economy**: Extend existing approval verification instead of building new subsystem.
- **Locality**: Changes confined to `verifyCriticApprovals`, helper tests in work-process, and possibly critics log entries.
- **Visibility**: Error messages should enumerate missing approvals/evidence for earlier phases.
- **Evolution**: Requirements defined in a mapping so future phases can be added easily.

---

## Via Negativa
- Considered leaving gate enforcement as-is and relying on tests; rejected—lack of enforcement risks autopilot skipping phases.
- Deleting gate checks not acceptable.

---

## Alternatives
1. **Inline checks in WorkProcessEnforcer** – would duplicate logic; prefer centralized verification module. Rejected.
2. **New critic** that aggregates phase status – heavy. Rejected.
3. **Selected** – expand existing requirements map to include strategy/spec/plan approvals when transitioning from `think`, and ensure evidence files exist.

---

## Implementation Plan
1. Extend requirements map so `think` transition requires `strategy`, `spec`, `plan`, `think` artifacts (with approvals). Possibly treat `plan` approval as spec? we can piggyback on existing logs—if none exist, instruct user to run gate.
2. For artifacts without existing critic logs (spec/plan), decide on enforcement approach:
   - Check for file presence and rely on strategy/think/design critics; spec/plan currently lack dedicated critics. Proposed approach: require `spec.md` & `plan.md` existence; if we add new analytics logs, tests would fail. We'll implement presence check plus link to plan-phase evidence. Document in error message.
3. Update tests:
   - Extend `seedCriticApprovals` to handle spec/plan presence (no logs) and ensure `strategy.md`, `spec.md`, `plan.md`, `think.md` exist.
   - Add new test verifying gate rejects transitions when spec/plan missing or approvals absent, and passes when seeded.
4. Update error messaging to list missing artifacts separately from critic approval failures.
5. Run `npx vitest run src/work_process/index.test.ts` and `npx tsc --noEmit`.

---

## Risks / Open Questions
- Spec/plan phases lack dedicated critic logs; enforcement will check file existence/ledger coverage but cannot verify approvals beyond presence. Acceptable interim solution; document in TODO.
- Must ensure backward compatibility: changes may block existing ledger entries if spec/plan missing; autop-run should include placeholders.

---

## Review Checklist
- [ ] Identify artifacts required for gate
- [ ] Update verification logic and error formatting
- [ ] Add tests for missing artifacts/approvals
- [ ] Verify TypeScript + Vitest
- [ ] Document limitations (lack of spec/plan critics)

**Design Date:** 2025-11-06
**Author:** Codex
