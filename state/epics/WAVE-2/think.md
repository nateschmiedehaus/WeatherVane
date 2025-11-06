# THINK: WAVE-2

**Epic ID:** WAVE-2
**Date:** 2025-11-06

---

## Edge Cases

### README Staleness
**Scenario:** Code changes, READMEs outdated

**Mitigation:**
- Auto-regeneration on commit
- Manifest telemetry detects staleness
- CI blocks if >10% stale

### Prompt Quality Degradation
**Scenario:** Dynamic prompts worse than handcrafted

**Mitigation:**
- A/B testing framework
- Version all prompts
- Rollback mechanism

---

## Failure Modes

### Documentation Overwhelm
**Symptom:** Too many READMEs, maintenance burden

**Mitigation:**
- Template automation
- Only generate where needed
- Archival policy

---

**Think complete:** 2025-11-06
