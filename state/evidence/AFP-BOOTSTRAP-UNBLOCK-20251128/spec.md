# Spec — AFP-BOOTSTRAP-UNBLOCK-20251128

## Deliverables
1. **Bootstrap ADR** (`meta/adr/ADR-BOOTSTRAP-20251128.md`):
   - Explains rationale, temporary budget cap (max_new_files=12, max_loc_added=1200), steward, and sunset condition (expire once MVP demo passes CI).
   - Notes tagging convention `#BOOTSTRAP` for entropy watchdog adjustments.
2. **Sub-task decomposition** documented in ADR + summary table (supervisor, agents, libs, adapters), each referencing evidence/log requirements.
3. **Roadmap adjustments** in `state/roadmap.yaml` aligning dependencies:
   - AFP-DPS-BUILD-20251116 depends on `AFP-MVP-SUPERVISOR-SCAFFOLD` and `AFP-MVP-AGENTS-SCAFFOLD`.
   - AFP-MEMORY-CORE-20251117 depends on AFP-DPS-BUILD-20251116.
4. **Evidence bundle** capturing commands and validations:
   - `verify/adr_record.md` – link to ADR and steward confirmation placeholder.
   - `verify/roadmap_diff.txt` – excerpt of dependency changes.
   - `verify/commands.txt` – commands executed (git diff excerpt, etc.).

## Acceptance Criteria
- ADR present with steward autopilot-core, sunset clause, and budget revert instructions.
- Roadmap updates merge cleanly and keep YAML valid (run `yq e 'true'` implicitly by ensuring `python -m yaml` success?).
- Evidence includes `git status -sb` snapshot pre/post updates.
- Guardrails: no code scaffolding yet, only meta/config changes (LOC within default budgets).
