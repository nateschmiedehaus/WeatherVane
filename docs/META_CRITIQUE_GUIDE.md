# Meta-Critique & Refactor Playbook

Meta critics are empowered to look across finished work, past releases, and
parallel epics to surface systemic risks. When a critique uncovers a gap,
follow this loop:

1. **Detect & Evidence**
   - Capture the critic output in `state/critics/*.json` and summarise the
     finding in `state/context.md` (what broke, user/customer impact, why it
     matters).
   - If the issue affects a previously “done” task, identify the task ID(s) and
     reference commit hashes or artifacts.

2. **Re-open or Add Work**
   - Use `plan_update` to move the affected task(s) back to `in_progress` or
     `blocked`. If the roadmap lacks a suitable slice, append a new task or
     milestone in `state/roadmap.yaml` with clear exit criteria.
   - Tag new meta tasks with `domain: product` (or `meta` if cross-cutting) and
     set `priority: critical` in the notes so the planner promotes them.

   - Batch observations when possible—run a meta sweep after a meaningful slice
     of work instead of firing a critic after every small task so the team can
     act without thrash.

3. **Refactor Decisively**
   - Refactors can and should span multiple modules when the critic indicates a
     broader failure (architecture, design system, data leakage, security).
   - Group related work into coherent commits, but don’t shy away from sweeping
     changes—ensure automated tests and critics cover the new surface area.

4. **Close the Loop**
   - Run the relevant critics (build/tests/design/system/etc.) and attach
     evidence (screenshots, telemetry, benchmark reports).
   - Update `docs/META_CRITIQUE_GUIDE.md` with lessons learned if the fix reveals
     a reusable pattern or new guardrail worth institutionalising.
   - Mark the task complete only when the critic passes and the regression risk
     is mitigated (monitoring, docs, playbooks updated).

Meta critics are expected to think beyond the current sprint: if there is a
better design, a more resilient architecture, or a cheaper operational model,
raise it, create the roadmap entry, and drive it to completion. Refactor with
purpose, document the why, and leave the system stronger than you found it.
