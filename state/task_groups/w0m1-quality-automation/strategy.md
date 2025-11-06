# STRATEGY: w0m1-quality-automation

**Set ID:** w0m1-quality-automation
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Autopilot can execute tasks, but needs quality assurance to ensure work meets AFP/SCAS standards:
- **Domain expert templates:** Agents need role-specific guidance (researcher vs implementer vs reviewer)
- **Process critic:** Automated validation that work follows 10-phase AFP lifecycle

**Current state:**
- All agents use same generic behavior (no specialization)
- No automated process compliance checking
- Manual review required for every task
- Quality inconsistent

**Pain points:**
1. **Generic agents** - Researcher same as implementer (no domain expertise)
2. **Process violations** - Skip THINK, weak STRATEGIZE, no GATE
3. **Manual QA burden** - Every task needs human review
4. **Inconsistent quality** - Some tasks excellent, others superficial

---

## Root Cause

**Why does this gap exist?**

**Historical:**
- Built single generic agent (MVP)
- Process compliance assumed, not enforced
- No critics to validate work

**Systemic:**
- No role-based templates
- No automated QA
- Trust-based quality (no verification)

**The core issue:** **No domain specialization or automated quality assurance**

---

## Goal / Desired Outcome

**Build quality automation layer:**

### 1. Domain Expert Templates Operational
- Researcher template (how to research effectively)
- Implementer template (how to code AFP-compliant)
- Reviewer template (how to review critically)
- Specialist templates (data science, devops, etc.)

**Measurable:** Agents select appropriate template, work quality improves

### 2. ProcessCritic Operational
- Validates all 10 AFP phases present
- Checks phase quality (not just presence)
- Enforces gates (GATE before IMPLEMENT)
- Blocks superficial work

**Measurable:** ProcessCritic catches violations, quality gates enforced

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Generic agents → specialized templates
- Manual QA → automated critic
- Assumed compliance → enforced compliance

**What are we ADDING?**
- Domain templates (~200 LOC)
- ProcessCritic (~300 LOC)

**Is the addition justified?**
- **Yes:** Eliminates manual QA (hours saved per task)
- **Yes:** Improves quality (consistency)
- **Yes:** Enforces process (compliance)

---

## Success Criteria

**Set complete when:**

### Domain Templates Operational
- [ ] 3+ templates created (researcher, implementer, reviewer)
- [ ] Agents select template based on task
- [ ] Templates guide behavior
- [ ] Quality improves (measured by reviews)

### ProcessCritic Operational
- [ ] Validates all 10 phases
- [ ] Checks phase quality
- [ ] Enforces gates
- [ ] Blocks violations

---

## Estimated Effort

**Domain templates:** 6 hours
**ProcessCritic:** 8 hours

**Total:** ~14 hours

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md
**Owner:** Claude Council
**Tasks in set:** AFP-W0-M1-DOMAIN-EXPERT-TEMPLATES, AFP-W0-M1-PROCESS-CRITIC
