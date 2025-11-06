# Deep Thinking Analysis — AFP-LEGACY-ARTIFACTS-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane Council)

---

## Purpose

Anticipate pitfalls while formalizing how we bring the lingering untracked artifacts under Git discipline. The intent is to make the cleanup durable: no silent drift, no loss of override evidence, and no recurrence of stray `.tmp` files. I want to surface remediation steps now so we execute them during implementation instead of retroactively patching gaps.

---

## Edge Cases

1. **Override ledger explodes in size**
   - Scenario: `state/overrides.jsonl` continues to log override events and could grow without bounds.
   - Impact: Medium – large diffs become unwieldy; risk of agents truncating file locally.
   - Mitigation: Record remediation to add rotation/backlog review in roadmap. For this task, capture the existing ledger and note follow-up in review doc.

2. **Proof system contains generated JS**
   - Scenario: If compilation output sneaks into `tools/wvo_mcp/src/prove`, we might accidentally stage build artifacts.
   - Impact: High – pollutes history with derived files.
   - Mitigation: Inspect directory; confirm only `.ts`. If `.js` exists, delete and add `.gitignore` rule.

3. **Evidence directories contain large binaries**
   - Scenario: Evidence might include screenshots or logs bloating repo.
   - Impact: Medium – slows clone and review.
   - Mitigation: Audit directories before staging; if binaries exist, evaluate compressing or referencing external storage (not present after inspection).

4. **`roadmap.json.tmp` is actually needed by tooling**
   - Scenario: Some script expects `.tmp` to persist; deleting could break workflow.
   - Impact: Low – file empty, no references, but confirm by searching codebase (done: no matches).
   - Mitigation: Document rationale in design; add `.gitignore` entry so tooling can recreate without dirtying tree.

5. **Agents regenerate new untracked files immediately after cleanup**
   - Scenario: Without documentation and guardrails, repo drifts again.
   - Impact: High – effort wasted.
   - Mitigation: Reinforce policy in AGENTS/claude docs (already updated) and log remediation in review to schedule periodic audits.

**Remediation Note (Think Phase Minimum Action):** Schedule a quarterly “artifact inventory” check in `state/evidence/AFP-LEGACY-ARTIFACTS-20251106/review.md` and flag need for override ledger rotation so the task generates concrete follow-up work.

---

## Failure Modes

1. **Failure Mode: Hidden Generated Outputs**
   - Cause: We miss a generated file (e.g., `.cache`, compiled JS) while staging entire directories.
   - Symptom: Future commits show frequent changes to that file with no real work.
  - Impact: High
   - Likelihood: Low (manual inspection)
   - Detection: `git diff --cached` review before commit.
   - Mitigation: Manually inspect each directory and document allowed extensions; delete offenders now.

2. **Failure Mode: `.gitignore` entry too broad**
   - Cause: Adding `state/roadmap*.tmp` might accidentally ignore legitimate roadmap snapshots.
   - Symptom: Missing roadmap updates in GitHub.
   - Impact: Medium
   - Likelihood: Medium (if pattern careless)
   - Detection: `git check-ignore -v state/roadmap.json`
   - Mitigation: Use exact filename `state/roadmap.json.tmp` and double-check normal roadmap files remain trackable.

3. **Failure Mode: Evidence metadata becomes inconsistent**
   - Cause: Staging evidence directories without updating `phases.md` or `plan.md` could confuse reviewers.
   - Symptom: Evidence references missing steps.
   - Impact: Medium
   - Likelihood: Medium
   - Detection: Manual audit of evidence entries.
   - Mitigation: Leave evidence unaltered (we're only adding existing files) and ensure our own task artifacts are complete before staging.

4. **Failure Mode: Override ledger conflicts during merges**
   - Cause: Concurrent agents append to `state/overrides.jsonl`.
   - Symptom: Merge conflicts hard to resolve.
   - Impact: Medium
   - Likelihood: Medium
   - Detection: Git merge conflict alerts.
   - Mitigation: Encourage append-only semantics with sorted timestamps; consider future tooling for rotation (call out remediation).

5. **Failure Mode: Pre-commit hooks reject large staging set**
   - Cause: Guardrail prohibits >5 files / >150 net LOC.
   - Symptom: Hook blocks commit.
   - Impact: Low (workaround: micro-batch).
   - Likelihood: High (since we add many files).
   - Detection: Pre-commit failure.
   - Mitigation: Stage and commit in logical groups (evidence vs code) and document approach.

---

## Complexity Reflection

- The task primarily reduces cognitive load by making repo state truthful. Complexity only increases slightly through `.gitignore` specificity, which is acceptable.
- Biggest uncertainty remains override ledger growth; flagged as remediation.

---

## Summary

We will:
- Track supervisor proof system sources and both evidence bundles.
- Capture `state/overrides.jsonl` in Git while noting future rotation needs.
- Delete `state/roadmap.json.tmp`, ignore it going forward, and document the decision.
- Stage work in micro-batches to respect AFP guardrails.
- Document remediation commitments in review (quarterly audits + override rotation owner).
