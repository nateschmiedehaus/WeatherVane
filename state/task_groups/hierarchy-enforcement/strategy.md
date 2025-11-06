# STRATEGY: hierarchy-enforcement

**Set ID:** hierarchy-enforcement
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Problem

Hierarchy defined but not enforced - agents can violate structure.

---

## Goal

**Enforce hierarchy at all levels:**
- Pre-commit hooks block violations
- Epics must have phase docs before tasks
- Sets must have phase docs before tasks
- Tasks must have set_id/epic_id

---

## Success Criteria

- [ ] Pre-commit hook validates hierarchy
- [ ] Blocks tasks without set_id
- [ ] Blocks work without epic/set docs
- [ ] Override mechanism (LOC_OVERRIDE pattern)

---

**Tasks in set:** AFP-W0-M3-HIERARCHY-ENFORCEMENT
