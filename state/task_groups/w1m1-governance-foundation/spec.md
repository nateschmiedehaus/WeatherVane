# SPEC: w1m1-governance-foundation

**Set ID:** w1m1-governance-foundation
**Milestone:** W1.M1
**Epic:** WAVE-1
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Governance Bootstrap Complete
```bash
test -d tools/wvo_mcp/src/governance
test -f state/governance/ledger.jsonl
```

### AC2: Guardrails Catalog Published
```bash
test -f docs/governance/guardrails_catalog.md
# Should have ≥20 rules
```

### AC3: Ledger Operational
```bash
# Log decision
echo '{"type":"decision","decision":"test"}' >> state/governance/ledger.jsonl
# Query works
cat state/governance/ledger.jsonl | jq '.'
```

---

**Spec complete:** 2025-11-06
