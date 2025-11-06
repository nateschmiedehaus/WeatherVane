# SPEC: w0m1-validation-and-readiness

**Set ID:** w0m1-validation-and-readiness
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Roadmap Audit Complete

**Given:** Current roadmap.yaml
**When:** Audit performed
**Then:**
- Timeline to autonomy calculated
- Critical path identified
- Dependencies validated
- Report generated

**Test:**
```bash
# Run audit
npm run audit:roadmap

# Check report exists
test -f state/evidence/AFP-W0-M1-ROADMAP-AUDIT/audit_report.md

# Verify timeline ≤4 weeks
grep "Timeline: [1-4] weeks" state/evidence/AFP-W0-M1-ROADMAP-AUDIT/audit_report.md
```

**Success:** Report confirms ≤4 week autonomy path

---

### AC2: Proof Loop Validated

**Given:** 3 test tasks in roadmap
**When:** Wave 0 executes tasks
**Then:**
- All phases complete (STRATEGIZE → MONITOR)
- Evidence bundles generated
- All required files present

**Test:**
```bash
# Run Wave 0 with test tasks
cd tools/wvo_mcp && npm run wave0

# Check evidence for test tasks
for task in TEST-001 TEST-002 TEST-003; do
  test -d ../../state/evidence/$task || exit 1
  test -f ../../state/evidence/$task/strategy.md || exit 1
  test -f ../../state/evidence/$task/spec.md || exit 1
  test -f ../../state/evidence/$task/plan.md || exit 1
done
```

**Success:** All 3 tasks have complete evidence bundles

---

### AC3: Scaffold Execution Validated

**Given:** Full scaffold (supervisor + agents + infrastructure)
**When:** 5 tasks executed
**Then:**
- All tasks complete autonomously
- 0 manual interventions
- All components used
- Performance acceptable

**Test:**
```typescript
// Integration test
const results = await scaffoldTest.run({
  taskCount: 5,
  timeout: 7200000 // 2 hours
});

expect(results.completed).toBe(5);
expect(results.manualInterventions).toBe(0);
expect(results.errors).toHaveLength(0);
expect(results.avgDuration).toBeLessThan(1800000); // <30 min avg
```

**Success:** 5/5 tasks complete, 0 interventions

---

### AC4: Exit Readiness Confirmed

**Given:** All Wave 0 work complete
**When:** Exit validation runs
**Then:**
- All exit criteria checked
- Report generated
- Green/red status per criterion

**Test:**
```bash
# Run exit validation
npm run validate:exit

# Check report
test -f state/evidence/AFP-W0-M1-EXIT-READINESS/exit_report.md

# All criteria must be green
! grep "❌" state/evidence/AFP-W0-M1-EXIT-READINESS/exit_report.md
```

**Success:** All criteria show ✅

---

## Exit Criteria

**Set complete when:**

- [x] AC1: Roadmap audit complete
- [x] AC2: Proof loop validated (3+ tasks)
- [x] AC3: Scaffold execution validated (5+ tasks)
- [x] AC4: Exit readiness confirmed

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md
**Owner:** Claude Council
