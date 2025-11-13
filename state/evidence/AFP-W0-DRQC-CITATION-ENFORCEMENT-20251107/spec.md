# SPEC - AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107

**Task:** DRQC Citation Enforcement - Mandatory Research Citations in Every Phase
**Created:** 2025-11-07T16:05:00Z
**Phase:** SPEC

## Acceptance Criteria

### AC1: Template Updates

**Given** the 10 AFP phase templates in `docs/templates/`
**When** a task author uses any template
**Then** the template MUST include:
- DRQC Citations section with format: `**DRQC Citation:** Page X, "Section Name": > quote`
- Concordance table with columns: Action | DRQC Citation | Artifact
- (VERIFY only) Live-Fire Evidence section with execution logs

**Success:** All 10 templates updated, tested with 1 sample task

**DRQC Justification:** Page 12, "Evidence or it didn't happen"
> "Every decision produces evidence (citations, diffs, test results). If it's not in the ledger, it didn't happen."

Templates are the ledger structure - must include citation fields.

### AC2: ProcessCritic Checks DRQC Citations

**Given** a phase document (strategy.md, spec.md, plan.md, etc.)
**When** ProcessCritic runs during pre-commit
**Then** ProcessCritic MUST:
- Extract all DRQC citations from the document
- Count citations (require ≥1 per phase)
- Validate page references exist in PDF (basic check: page number ≤ total pages)
- Check for concordance table (required for STRATEGIZE, SPEC, PLAN, THINK, GATE, VERIFY, REVIEW, PR)
- Fail with `drqc_citations_missing` if 0 citations
- Fail with `drqc_concordance_missing` if table absent
- Fail with `drqc_page_invalid` if page number > PDF page count

**Success:** ProcessCritic blocks commits lacking DRQC citations

**DRQC Justification:** Page 15, "Role separation + hard gates"
> "Use small, specialized agents (Planner, Coder, Tester, Reviewer, Roadmap-Editor) with pass/fail gates."

ProcessCritic is the gate enforcer - must check DRQC compliance.

### AC3: Live-Fire Evidence Required in VERIFY

**Given** a VERIFY phase document (verify.md)
**When** ProcessCritic validates it
**Then** verify.md MUST contain:
- Execution logs (stdout/stderr from actual run)
- Test output (not just "tests passed" but actual test runner output)
- Coverage report (numbers, not just claims)
- Mutation testing results (if applicable)
- Performance metrics (if applicable)
- At least one DRQC citation justifying test approach

**Success:** Cannot commit verify.md without live execution evidence

**DRQC Justification:** Page 8, "Live-Fire Over Compile-Only"
> "Always run the program (or a realistic harness), not just lints. Add property-based tests + a tiny mutation budget per PR."

VERIFY without execution logs = compile-only (insufficient per DRQC).

### AC4: Pre-commit Hook Enforcement

**Given** staged files including phase documents
**When** `git commit` runs
**Then** pre-commit hook MUST:
- Call ProcessCritic with DRQC checks enabled
- Block commit if ProcessCritic fails
- Show clear error: "DRQC citations required in [phase].md"
- Allow exemption for non-research tasks (config-only, trivial docs)

**Success:** Hook blocks commits, shows helpful guidance

**DRQC Justification:** Page 18, "No gate, no progress"
> "Any gate fail → loop and remediate (don't advance on 'best effort')."

Pre-commit is a gate - must enforce DRQC or block.

### AC5: Documentation and Examples

**Given** a developer needs to add DRQC citations
**When** they consult documentation
**Then** docs MUST provide:
- `DRQC_CITATION_GUIDE.md` with format examples
- Updated `MANDATORY_WORK_CHECKLIST.md` with DRQC requirements
- Updated `AFP_QUICK_START.md` with citation examples
- Concordance table template in `docs/templates/concordance_template.md`

**Success:** Developer can add citations without external help

**DRQC Justification:** Page 3, "No silent assumptions"
> "Surface any hidden assumption as an invariant or test."

Documentation surfaces the assumption "you must cite DRQC" explicitly.

## Functional Requirements

### FR1: DRQC Citation Format

**Format:**
```markdown
**DRQC Citation:** Page [N], "[Section Name]"
> [Direct quote from research]

**Interpretation:** [How this quote justifies the decision]
```

**Example:**
```markdown
**DRQC Citation:** Page 8, "Live-Fire Over Compile-Only"
> "Always run the program (or a realistic harness), not just lints."

**Interpretation:** VERIFY must include execution logs, not just build success.
```

**Validation:** ProcessCritic regex matches this format

### FR2: Concordance Table Format

**Format:**
```markdown
### Concordance ([Phase Name])

| Action | DRQC Citation | Artifact |
|--------|---------------|----------|
| [What decision] | Page X, "Section" | [Where evidence lives] |
| [What decision] | Page Y, "Section" | [Where evidence lives] |
```

**Example:**
```markdown
### Concordance (Strategy)

| Action | DRQC Citation | Artifact |
|--------|---------------|----------|
| Require DRQC citations | Page 3, "First Principles" | This strategy.md |
| Enforce at gates | Page 15, "Role separation + hard gates" | ProcessCritic updates |
```

**Validation:** ProcessCritic checks for table with these columns

### FR3: Live-Fire Evidence Format (VERIFY)

**Required Sections in verify.md:**
```markdown
## Test Execution

### Unit Tests
[Actual test runner output - stdout/stderr]

### Integration Tests
[Actual test runner output]

### Coverage Report
[Coverage numbers with file breakdown]

### Mutation Testing (if applicable)
[mutmut or equivalent output]

### Live-Fire Harness
[Output from running verify.sh or verify.py]

## DRQC Citations
**DRQC Citation:** Page 8, "Live-Fire Over Compile-Only"
> "Always run the program (or a realistic harness), not just lints."
```

**Validation:** ProcessCritic checks for execution log artifacts

### FR4: Exemption Logic

**Non-research tasks exempted from DRQC requirements:**
- Pure configuration changes (`.env`, `config.yml` updates)
- Trivial documentation fixes (typos, formatting)
- Automated updates (dependency bumps, generated files)

**Detection:** Pre-commit hook checks:
- If only config files staged → exempt
- If commit message includes `[skip-drqc]` with justification → exempt (logged)
- Otherwise → enforce

**Logging:** All exemptions logged to `state/drqc_exemptions.jsonl` for review

### FR5: ProcessCritic Integration

**New ProcessCritic Methods:**
```typescript
interface DRQCCheck {
  extractCitations(content: string): DRQCCitation[]
  validatePageReferences(citations: DRQCCitation[]): boolean
  extractConcordance(content: string): ConcordanceTable | null
  checkLiveFireEvidence(verifyContent: string): boolean
}

interface DRQCCitation {
  page: number
  section: string
  quote: string
  interpretation?: string
}

interface ConcordanceTable {
  phase: string
  entries: Array<{
    action: string
    citation: string
    artifact: string
  }>
}
```

**Integration Point:** `inspectPlanDocument()` method in ProcessCritic

## Non-Functional Requirements

### NFR1: Performance

**Requirement:** DRQC checks add <500ms to commit time
**Validation:** Time pre-commit hook before/after DRQC checks
**Acceptance:** 95th percentile commit time increase ≤500ms

### NFR2: Usability

**Requirement:** Error messages clearly explain what's missing
**Example:**
```
❌ DRQC citations missing in strategy.md

Required: At least 1 DRQC citation in format:
**DRQC Citation:** Page X, "Section"
> Quote from research

See: docs/DRQC_CITATION_GUIDE.md for examples
```

**Validation:** Developer can fix error without asking for help

### NFR3: Maintainability

**Requirement:** DRQC enforcement code is ≤300 LOC
**Reason:** Keep enforcement logic simple and auditable
**Validation:** Count LOC in ProcessCritic DRQC methods

### NFR4: Compatibility

**Requirement:** Works on macOS and Linux
**Validation:** Test pre-commit hook on both platforms
**Note:** Windows support deferred (not a primary platform)

## Invariants

### INV1: DRQC PDF Exists

**Invariant:** `Deep Research Into Quality Control for Agentic Coding.pdf` exists in repo root
**Enforcement:** Pre-commit hook checks file existence before running DRQC validation
**Failure Mode:** If PDF missing, show error and skip DRQC checks (but log warning)

### INV2: Citation Count Monotonic

**Invariant:** Cannot remove DRQC citations from existing phase documents
**Enforcement:** If phase doc already committed with N citations, must have ≥N citations in new version
**Failure Mode:** Error if citation count decreases

### INV3: Concordance Completeness

**Invariant:** Every major decision in a phase must appear in concordance table
**Heuristic:** If phase has ≥3 "Alternatives Considered" or "Approach" sections, concordance must have ≥3 entries
**Enforcement:** ProcessCritic warns if mismatch

## Properties to Test

### Property 1: Citation Extraction Idempotent

**Property:** Extracting citations twice yields same result
**Test:** `extractCitations(content) === extractCitations(content)`
**Framework:** Standard unit test

### Property 2: Valid Page References

**Property:** All extracted page numbers are ≤ PDF page count (45)
**Test:** `all(c.page <= 45 for c in extractCitations(content))`
**Framework:** Property-based test (generate random valid citations)

### Property 3: Concordance Table Parseable

**Property:** If concordance exists, it must have ≥1 entry
**Test:** `extractConcordance(content) === null OR extractConcordance(content).entries.length >= 1`
**Framework:** Standard unit test

### Property 4: Live-Fire Evidence Non-Empty

**Property:** If VERIFY phase, live-fire section must have ≥100 chars (real logs, not placeholder)
**Test:** `checkLiveFireEvidence(content) => evidence.length >= 100`
**Framework:** Standard unit test

## Error Taxonomy

### E1: drqc_citations_missing
**Cause:** Phase document has 0 DRQC citations
**Severity:** CRITICAL - blocks commit
**Resolution:** Add at least 1 DRQC citation in required format

### E2: drqc_concordance_missing
**Cause:** Phase document lacks concordance table
**Severity:** CRITICAL - blocks commit
**Resolution:** Add concordance table with ≥1 entry

### E3: drqc_page_invalid
**Cause:** Citation references page > 45 (PDF has 45 pages)
**Severity:** HIGH - blocks commit
**Resolution:** Fix page reference to valid page number

### E4: live_fire_missing
**Cause:** verify.md lacks execution logs
**Severity:** CRITICAL - blocks commit (VERIFY only)
**Resolution:** Run tests, capture output, include in verify.md

### E5: drqc_pdf_not_found
**Cause:** PDF missing from repo root
**Severity:** MEDIUM - warning only (skips checks)
**Resolution:** Restore PDF to repo root

## DRQC Citations for This Spec

**Action:** Define acceptance criteria with DRQC grounding
**DRQC Citation:** Page 5, "Spec as Executable Contract"
> "SRD: user stories; I/O contracts; invariants; symmetries (idempotence/commutativity/encode↔decode/no-op); error taxonomy; perf/SLO."

**Interpretation:** This spec includes invariants (INV1-3), properties (P1-4), error taxonomy (E1-5), and acceptance criteria - matching DRQC's executable contract philosophy.

**Action:** Require concordance tables
**DRQC Citation:** Page 12, "Evidence Ledger"
> "Every decision produces evidence (citations, diffs, test results). If it's not in the ledger, it didn't happen."

**Interpretation:** Concordance table is the ledger format - maps decisions to evidence.

**Action:** Enforce live-fire in VERIFY
**DRQC Citation:** Page 8, "Live-Fire Over Compile-Only"
> "Always run the program (or a realistic harness), not just lints."

**Interpretation:** AC3 and FR3 enforce real execution logs in VERIFY phase.

### Concordance (Spec)

| Action | DRQC Citation | Artifact |
|--------|---------------|----------|
| Define 5 acceptance criteria | Page 5, "Spec as Executable Contract" | AC1-AC5 above |
| Require DRQC citations | Page 12, "Evidence Ledger" | FR1, FR2 formats |
| Enforce live-fire testing | Page 8, "Live-Fire Over Compile-Only" | AC3, FR3 |
| Add ProcessCritic checks | Page 15, "Role separation + hard gates" | FR5 interface |
| Define error taxonomy | Page 5, "error taxonomy" | E1-E5 above |
| Specify invariants | Page 5, "invariants" | INV1-INV3 above |
| Define testable properties | Page 5, "symmetries" | P1-P4 above |

---
Generated by Claude Council
Date: 2025-11-07T16:05:00Z
Phase: SPEC
Task: AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107
