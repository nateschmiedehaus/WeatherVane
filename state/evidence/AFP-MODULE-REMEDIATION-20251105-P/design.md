# Design: AFP-MODULE-REMEDIATION-20251105-P

> Introduce spec/plan reviewers so the gate phase can enforce upstream approvals.

---

## Context
- `verifyCriticApprovals` now requires `strategy.md`, `spec.md`, `plan.md`, `think.md` to exist, but only `strategy.md` and `think.md` have critic review logs.
- We need automated reviewers for spec and plan to maintain AFP discipline and keep autopilot’s gate deterministic.

---

## Five Forces
- **Coherence**: Follow existing pattern (strategy/think/design reviewers) – new critics write to analytics logs and use CLI wrappers.
- **Economy**: Lightweight checks (section presence, TODO markers) instead of full LLM critics. Reuse base critic infrastructure for logging.
- **Locality**: Critics under `src/critics`; CLI under `src/cli`; verification logic centralized in `critic_verification.ts`; tests updated accordingly.
- **Visibility**: Clear pass/fail messaging summarizing missing sections.
- **Evolution**: Logs stored in `state/analytics/spec_reviews.jsonl` & `plan_reviews.jsonl`, future watchers can consume.

---

## Via Negativa
- Alternative was to relax gate requirements; rejected (weakens guardrail). Manual approvals would reintroduce human toil.

---

## Alternatives Considered
1. **Extend existing critics** (e.g., strategy reviewer also checks spec/plan). Rejected; conflates responsibilities.
2. **Mock approvals in gate** – would bypass real verification. Rejected.
3. **Selected** – create two lightweight critics mirroring existing CLI workflow.

---

## Implementation Plan
1. Add `SpecReviewerCritic` and `PlanReviewerCritic` in `src/critics/`. Each should:
   - Read corresponding evidence file (`spec.md`, `plan.md`).
   - Check for minimal sections (e.g., `## Requirements`, `## Non-Functional` for spec; `## Work Plan`, `## Risks` for plan).
   - Produce pass/fail with detailed messages.
   - Persist approval to analytics log (similar format to strategy/think logs).
2. Add CLI wrappers `src/cli/run_spec_review.ts` & `run_plan_review.ts` that run the critics and print results.
3. Update `package.json` scripts with `spec:review` and `plan:review` commands.
4. Update `critic_verification.ts`:
   - Expand type union to include `'spec' | 'plan'`.
   - Extend `requirements` map for `think` to include `'spec'`, `'plan'`.
   - Extend `logMap` to include new files.
5. Update `seedCriticApprovals` helper in tests to seed spec/plan approvals.
6. Extend work-process tests to cover missing spec/plan approvals scenario and success path.
7. Run `npx vitest run src/work_process/index.test.ts` and `npx tsc --noEmit`.

---

## Risks / Mitigations
- **No existing spec/plan analytics log**: helper will create logs automatically; tests snapshot/restore to avoid pollution.
- **LOC/complexity**: Keep critics under ~60 LOC each.
- **Future expansions**: Map-based configuration ensures additional phases easy to add.

---

## Checklist
- [ ] Critics created with minimal heuristics
- [ ] CLI wrappers + npm scripts
- [ ] Verification map updated
- [ ] Tests updated & passing
- [ ] Evidence recorded

**Design Date:** 2025-11-06
**Author:** Codex
