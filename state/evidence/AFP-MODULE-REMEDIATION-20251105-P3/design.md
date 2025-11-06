# Design: AFP-MODULE-REMEDIATION-20251105-P3

> Validate spec/plan reviewer workflow on a live task and document the procedure.

---

## Context
- Spec/plan reviewers were added in task P, but their end-to-end use on a real evidence bundle hadn’t been demonstrated.
- We need to ensure real artifacts pass the new checks and approvals appear in the analytics logs that gate enforcement reads.

---

## Five Forces
- **Coherence**: Exercise the exact CLI commands (`spec:review`, `plan:review`) the automation will use.
- **Economy**: Reuse an existing remediation task (`AFP-MODULE-REMEDIATION-20251105-C`) rather than fabricating dummy data.
- **Locality**: Changes limited to evidence docs and reviewer logs.
- **Visibility**: Capture reviewer output and log entries for documentation.
- **Evolution**: Document the playbook so future tasks follow the same loop.

---

## Plan
1. Ensure `spec.md` and `plan.md` contain the required sections so reviewers pass.
2. Run `npm run spec:review` and `npm run plan:review` against task `AFP-MODULE-REMEDIATION-20251105-C`.
3. Confirm analytics logs (`spec_reviews.jsonl`, `plan_reviews.jsonl`) contain approved entries.
4. Record commands/output and update evidence documentation.

---

## Risks
- Reviewer requirements might not match existing documents; adjust headings accordingly.
- Logs could be polluted if cleanup fails; verify entries and note clean-up instructions.

---

## Verification
- Execute the reviewer commands and capture success messages.
- Tail the analytics logs to confirm entries exist for the task.
