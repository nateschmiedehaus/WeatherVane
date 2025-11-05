# Strategy: AFP-S1-GUARDRAILS

## Problem Statement

**What is the actual problem we're solving?**

The guardrails policy controller implementation exists (`tools/wvo_mcp/src/guardrails/catalog.ts`) with 4 builtin checks, but **no guardrail catalog is defined**. The catalog file (`meta/afp_scas_guardrails.yaml`) is missing, which means:

1. **No baseline guardrails** are documented or enforced
2. **No policy validation** can run (catalog loader will fail)
3. **Security/quality/governance** checks are implemented but unused
4. **Exit criteria cannot be met** (need catalog + validation tests)

**Current state:**
- ✅ Policy controller exists (`catalog.ts`)
- ✅ 4 builtin checks implemented
- ❌ No catalog file
- ❌ No guardrail definitions
- ❌ No validation tests

## Root Cause Analysis

**Why does this problem exist?**

The policy controller was built **infrastructure-first** (code before configuration), creating a **chicken-egg problem**: the infrastructure exists but has no configuration to run against.

**Why infrastructure-first?**
- Likely built incrementally during other tasks
- Code architecture validated before policy decisions
- Catalog schema evolved through implementation

**Impact:**
- Guardrails infrastructure is dormant (cannot enforce policies without catalog)
- Compliance gaps (security/quality checks not running)
- Technical debt (unused code until catalog created)

## Success Criteria

**How will we know when this is solved?**

**Measurable outcomes:**
1. ✅ `meta/afp_scas_guardrails.yaml` exists and validates against schema
2. ✅ Baseline guardrails defined for all 4 builtin checks
3. ✅ `evaluateGuardrails()` runs successfully on baseline suite
4. ✅ Tests verify guardrail checks pass on valid config
5. ✅ Tests verify guardrail checks fail on intentionally bad config

**Exit criteria (from roadmap):**
1. Guardrail catalog defined and validated against policy controller
2. Guardrail check fails on intentionally bad configuration and passes on baseline

## Impact Assessment

**What changes if we solve this?**

**Immediate benefits:**
- **Security:** Baseline security guardrails enforceable
- **Quality:** Quality checks (worktree clean, ledger integrity) active
- **Governance:** Policy enforcement hooks operational
- **Compliance:** Audit trail for guardrail evaluations

**Downstream enables:**
- Other tasks can add guardrails to catalog
- CI/CD can enforce guardrails in automated pipelines
- Agents can query guardrail status for compliance
- Policy violations become visible (not silent)

**Risks if not solved:**
- Security vulnerabilities undetected
- Quality drift unchecked
- Governance gaps hidden
- Compliance failures silent

## AFP/SCAS Alignment

**Via Negativa:**
- ✅ Minimal catalog (only baseline guardrails, not comprehensive)
- ✅ Reuse existing checks (no new implementations needed)
- ✅ Simple YAML (no complex DSL)

**Refactor Not Repair:**
- N/A (creating new catalog, not patching existing)

**Complexity Control:**
- ✅ Essential: Guardrail catalog required for policy enforcement
- ❌ Accidental: None - simplest possible YAML structure
- **Trade-off:** ~50 LOC catalog + ~100 LOC tests vs. unmeasured security/quality risk

**Measurement:**
- Guardrail evaluation results logged to JSONL for retrospectives
- Pass/fail rates trackable over time
- Policy violations quantified

## Decision

**Recommendation:** PROCEED with guardrail catalog creation

**Approach:**
1. Create `meta/afp_scas_guardrails.yaml` with baseline guardrails
2. Define 4 guardrails (one per builtin check)
3. Write tests validating catalog schema
4. Write tests proving checks pass/fail correctly
5. Document catalog structure for future additions

**Why now?**
- AFP-S1-LEDGER complete (dependency satisfied)
- Policy infrastructure dormant without catalog
- Low effort (4 guardrails, existing checks)
- High value (security/quality/governance)

**Alternatives considered:**
1. **Do nothing** - Keep infrastructure dormant
   - Con: Security/quality unchecked
   - Con: Technical debt grows
2. **Comprehensive catalog** - Define 20+ guardrails
   - Con: Over-engineering (SCAS violation)
   - Con: High maintenance burden
3. **Baseline first** (SELECTED) - 4 guardrails, expand later
   - Pro: Minimal viable policy
   - Pro: Incremental expansion
   - Pro: Fast to implement

---

**Strategy Date:** 2025-11-05
**Author:** Claude Council
**Recommendation:** Proceed to SPEC
