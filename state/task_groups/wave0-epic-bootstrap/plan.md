# PLAN: wave0-epic-bootstrap

**Set ID:** wave0-epic-bootstrap
**Date:** 2025-11-06

---

## Tasks

1. **AFP-W0-EPIC-BOOTSTRAP** (main task)
   - Create all 5 epic phase docs for WAVE-0
   - Analyze existing W0.M1/M2 work to extract patterns
   - Write substantial docs (2-3 pages each)

---

## Sequencing

**Single task, linear execution:**
1. Read existing WAVE-0 evidence (W0.M1/M2 summaries)
2. Extract: Why? What outcomes? How integrated? What risks? What patterns?
3. Write strategy.md (2-3 pages)
4. Write spec.md (2-3 pages)
5. Write plan.md (2-3 pages)
6. Write think.md (1-2 pages)
7. Write design.md (2-3 pages)
8. Run OutcomeCritic for validation
9. Iterate if blocked

---

## Shared Pattern

**Pattern for this set:** Epic-level phase documentation

**Depth guidance:**
- **Strategy:** 2-3 pages (why epic exists, urgency, alignment)
- **Spec:** 2-3 pages (measurable outcomes, metrics, requirements)
- **Plan:** 2-3 pages (milestones, integration, sequencing)
- **Think:** 1-2 pages (risks, dependencies, failure modes)
- **Design:** 2-3 pages (architecture, patterns, alternatives)

**Not:**
- Superficial (1-paragraph docs)
- Compliance theater (checkboxes without thought)
- Backfilled justification (documenting after the fact)

**But:**
- Honest analysis of what WAVE-0 IS
- Real thinking about outcomes/risks
- Useful reference for future work

---

## Via Negativa (Set-level)

**Can we DELETE tasks?**
- No - single task, already minimal

**Can we simplify?**
- Could skip some phase docs? No - need all 5 for consistency
- Could auto-generate? No - need human thinking
- Could reuse existing evidence? YES - extract from W0.M1/M2 summaries

---

## Files Created

```
state/epics/WAVE-0/
├── strategy.md  (new, ~600 words)
├── spec.md      (new, ~600 words)
├── plan.md      (new, ~700 words)
├── think.md     (new, ~400 words)
└── design.md    (new, ~700 words)
```

**Total:** 5 files, ~3000 words (~10-12 pages)

**Within limits?** Yes - this is epic-level (larger scope than task)

---

## Testing

**Manual validation:**
1. Read each doc - does it answer core questions?
2. Check measurability - are outcomes testable?
3. Check depth - is thinking substantial?

**Automated validation:**
4. Run: `npm run epic:review WAVE-0`
5. OutcomeCritic checks outcomes measurable
6. Fix concerns, iterate

---

## Success Criteria

- [ ] All 5 docs exist
- [ ] Each doc 2-3 pages (substantial)
- [ ] Outcomes measurable (can test)
- [ ] OutcomeCritic approves
- [ ] Docs useful for future epic creation

---

**Plan complete:** 2025-11-06
**Next:** Execute AFP-W0-EPIC-BOOTSTRAP task
