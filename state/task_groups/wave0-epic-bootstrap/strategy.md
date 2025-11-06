# STRATEGY: wave0-epic-bootstrap

**Set ID:** wave0-epic-bootstrap
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Problem

We're already executing WAVE-0 tasks (W0.M1, W0.M2 complete) but WAVE-0 epic itself has no phase docs (strategy/spec/plan/think/design). This violates the hierarchical process we're building.

**The bootstrap paradox:**
- Can't enforce "epics must have phase docs before tasks"
- Because WAVE-0 already HAS tasks (30+)
- But WAVE-0 doesn't have epic phase docs

**Root cause:** We built task-level process first, now retrofitting epic-level

---

## Goal

Create WAVE-0 epic phase docs (strategy/spec/plan/think/design) to:
1. **Bootstrap the hierarchy** - Make WAVE-0 compliant with its own rules
2. **Document what WAVE-0 IS** - Why foundation stabilization? What outcomes?
3. **Enable enforcement** - Can't enforce epic gates on others until W0 is compliant

---

## Why This Set Exists

**Clustering rationale:** Single task (AFP-W0-EPIC-BOOTSTRAP) but requires set because:
- ALL tasks must be in sets (mandatory embedding)
- This is foundational work (deserves its own set)
- May add more bootstrap tasks later (PROJECT-level, META-level docs)

---

## AFP/SCAS Alignment

**ECONOMY (Via Negativa):**
- Can we DELETE this work? No - without epic docs, can't enforce hierarchy
- Can we simplify? No - need all 5 phase docs (strategy/spec/plan/think/design)

**COHERENCE (Match terrain):**
- Matches existing task-level process (same phases)
- Reuses templates (will create epic templates from this)

**LOCALITY:**
- Epic docs in `state/epics/WAVE-0/` (all WAVE-0 context together)

**VISIBILITY:**
- Makes WAVE-0's purpose explicit (not inferred from tasks)

**EVOLUTION:**
- First epic-level docs become template for future epics

---

**Strategy complete:** 2025-11-06
**Next:** spec.md (what success looks like)
