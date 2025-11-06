# DESIGN: WAVE-2

**Epic ID:** WAVE-2
**Date:** 2025-11-06

---

## Architecture

```
README Automation          Prompt Architecture
        ↓                          ↓
    Templates  →  Generation  →  Registry
        ↓                          ↓
   Manifest Telemetry      Evaluation System
```

---

## Core Patterns

### Pattern 1: Template + Generation
- Templates define structure
- Generation populates from code
- Auto-update on changes

### Pattern 2: Prompt Versioning
- All prompts versioned
- A/B testing infrastructure
- Rollback capability

---

## AFP/SCAS Score: 44/50 (88%)

**ECONOMY:** 9/10 (automates docs/prompts)
**COHERENCE:** 9/10 (template pattern proven)
**LOCALITY:** 8/10 (READMEs distributed)
**VISIBILITY:** 9/10 (documentation obvious)
**EVOLUTION:** 9/10 (version/test infrastructure)

**Status:** ✅ APPROVED

---

**Design complete:** 2025-11-06
