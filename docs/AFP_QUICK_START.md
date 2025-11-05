# AFP Quick-Start Guide

> **Read this in 10 minutes. Use it every day.**

---

## What is AFP?

**Anti-Fragile Programming (AFP)** is a framework that makes codebases learn and improve over time instead of degrading. It's enforced by pre-commit hooks and GATE reviews, so you can't accidentally violate it.

**Core idea:** Five forces guide all decisions. Follow them, and your code gets better. Ignore them, and code muck accumulates.

---

## The Five Forces

### 1. COHERENCE → Match the terrain

**Principle:** Your code should feel like it was always there. Search for existing patterns before creating new ones.

**30-second heuristic:**
- Look at the 3 most similar modules
- Copy their style (naming, structure, error handling)
- Reuse their patterns if they fit

**Commit message:** \`Pattern: error_logging_with_context\`

### 2. ECONOMY → Achieve more with less

**Principle:** The best code is no code. Delete before adding. Reuse before writing. Simplify before extending.

**30-second heuristic:**
- If adding >50 LOC, spend 5 minutes looking for code to delete
- Can you reuse instead of write?
- Can you simplify existing code to handle the new case?

**Commit message:** \`Deleted: duplicate task text computation in 3 methods (-6 LOC)\`

### 3. LOCALITY → Related near, unrelated far

**Principle:** Code that changes together lives together. Minimize coupling across boundaries.

**30-second heuristic:**
- Keep related changes in 1-2 modules max
- Don't scatter a single concept across 10 files
- Dependencies should be local, not global

### 4. VISIBILITY → Important obvious, unimportant hidden

**Principle:** Errors must be loud. Interfaces must be clear. Hide complexity behind abstraction.

**30-second heuristic:**
- Log all errors with context (no empty catch blocks)
- Public APIs should be minimal and self-explanatory
- Hide implementation details

### 5. EVOLUTION → Patterns prove fitness

**Principle:** Track which patterns work (low bugs, easy changes). Deprecate patterns that fail. Let good patterns spread.

**30-second heuristic:**
- When using a pattern, reference it in commit message
- When creating a new pattern, explain why and how you'll measure success
- Pattern fitness = usage + low bugs + easy changes

---

## How to Comply

### Commit Message Format

**Every commit needs:**
1. **Pattern reference:** Which pattern you're using OR why you need a new one
2. **Deletion accounting** (if +50 LOC): What did you delete/simplify?

**Examples:**

\`\`\`
feat(orchestrator): improve error handling

Pattern: error_logging_with_context
Deleted: duplicate task text computation (-2 LOC)
\`\`\`

\`\`\`
feat(config): extract keywords to config

New pattern: config_based_keyword_matching
Reason: Hardcoded arrays scattered across 12 methods
LOC: +82 config, -13 code = +69 net
\`\`\`

### Override for Edge Cases

If you genuinely can't follow the rules:

\`\`\`bash
git config hooks.override "emergency hotfix for production"
git commit
\`\`\`

This logs to \`state/overrides.jsonl\` for weekly review.

---

**Full documentation:** See \`MANDATORY_WORK_CHECKLIST.md\` and \`docs/templates/design_template.md\`
