# SPEC: w0m1-quality-automation

**Set ID:** w0m1-quality-automation
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Domain Expert Templates Exist

**Given:** Agent needs to execute task
**When:** Agent selects template
**Then:**
- Template library available
- Template selected based on task type
- Template provides role-specific guidance

**Test:**
```typescript
import { templateLibrary } from '../dps';

// Test template selection
const researchTemplate = templateLibrary.getTemplate({
  taskType: 'research',
  role: 'researcher'
});

expect(researchTemplate).toBeDefined();
expect(researchTemplate.phases).toContain('STRATEGIZE');

const implementTemplate = templateLibrary.getTemplate({
  taskType: 'feature',
  role: 'implementer'
});

expect(implementTemplate).toBeDefined();
expect(implementTemplate.phases).toContain('IMPLEMENT');
```

**Success:** Templates exist and are selectable

---

### AC2: ProcessCritic Validates AFP Lifecycle

**Given:** Evidence bundle for completed task
**When:** ProcessCritic runs
**Then:**
- All 10 phases checked
- Missing phases flagged
- Quality assessed
- Report generated

**Test:**
```bash
# Run ProcessCritic on evidence
cd tools/wvo_mcp && npm run critic:process AFP-TEST-TASK-001

# Should output validation report
# Check report shows all phases
grep "STRATEGIZE.*✅" ../../state/critics/process.json
grep "IMPLEMENT.*✅" ../../state/critics/process.json
```

**Success:** Critic validates all phases

---

### AC3: ProcessCritic Blocks Violations

**Given:** Task skipped GATE phase
**When:** ProcessCritic runs
**Then:**
- Violation detected
- Status: BLOCKED
- Clear error message

**Test:**
```typescript
const result = await processCritic.validate({
  taskId: 'AFP-TEST-SKIPPED-GATE',
  evidenceDir: 'state/evidence/AFP-TEST-SKIPPED-GATE'
});

expect(result.status).toBe('BLOCKED');
expect(result.violations).toContain('Missing GATE phase (design.md)');
```

**Success:** Violations blocked

---

## Exit Criteria

**Set complete when:**

- [x] AC1: Domain templates exist
- [x] AC2: ProcessCritic validates lifecycle
- [x] AC3: ProcessCritic blocks violations

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md
**Owner:** Claude Council
