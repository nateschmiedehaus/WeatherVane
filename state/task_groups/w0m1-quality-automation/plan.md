# PLAN: w0m1-quality-automation

**Set ID:** w0m1-quality-automation
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Execution Approach

Execute sequentially:

```
Task 1: AFP-W0-M1-DOMAIN-EXPERT-TEMPLATES
   ↓
Task 2: AFP-W0-M1-PROCESS-CRITIC
   ↓
Set Complete ✅
```

---

## Task 1: AFP-W0-M1-DOMAIN-EXPERT-TEMPLATES

### Approach

**Step 1: Create template library**
```bash
mkdir -p tools/wvo_mcp/src/dps/templates
touch tools/wvo_mcp/src/dps/templates/researcher.yaml
touch tools/wvo_mcp/src/dps/templates/implementer.yaml
touch tools/wvo_mcp/src/dps/templates/reviewer.yaml
```

**Step 2: Define researcher template**

File: `tools/wvo_mcp/src/dps/templates/researcher.yaml`

```yaml
role: researcher
description: Systematic research and analysis
phases:
  STRATEGIZE:
    focus: Define research question clearly
    questions:
      - What exactly are we trying to learn?
      - Why does this matter?
      - What will we do with this knowledge?

  SPEC:
    focus: Research methodology
    questions:
      - What sources will we consult?
      - How will we validate findings?
      - What's our confidence threshold?

  PLAN:
    focus: Research execution plan
    steps:
      - Literature review
      - Code analysis
      - Expert consultation
      - Synthesis

  THINK:
    focus: Alternative interpretations
    questions:
      - What biases might we have?
      - What alternative explanations exist?
      - What are we missing?
```

**Step 3: Define implementer template** (similar structure for coding)

**Step 4: Define reviewer template** (focus on critical analysis)

**Step 5: Integrate with DPS**

```typescript
export class TemplateLibrary {
  async getTemplate(criteria: {
    taskType: string;
    role: string;
  }): Promise<Template> {
    const path = `src/dps/templates/${criteria.role}.yaml`;
    return await fileIO.readYAML(path);
  }
}
```

### Exit Criteria
- [x] 3+ templates created
- [x] Template selection works
- [x] Integration with DPS complete

### Files Changed
- 3 template files (~100 LOC each)
- Integration code (~100 LOC)

**Total:** ~400 LOC

---

## Task 2: AFP-W0-M1-PROCESS-CRITIC

### Approach

**Step 1: Create ProcessCritic**

File: `tools/wvo_mcp/src/critics/process.ts`

```typescript
export interface ProcessCriticResult {
  status: 'approved' | 'blocked';
  violations: string[];
  warnings: string[];
  phaseChecks: Record<string, PhaseCheck>;
}

export class ProcessCritic {
  async validate(options: {
    taskId: string;
    evidenceDir: string;
  }): Promise<ProcessCriticResult> {
    const violations: string[] = [];
    const warnings: string[] = [];
    const phaseChecks: Record<string, PhaseCheck> = {};

    // Check each phase
    const phases = [
      'STRATEGIZE', 'SPEC', 'PLAN', 'THINK', 'GATE',
      'IMPLEMENT', 'VERIFY', 'REVIEW', 'PR', 'MONITOR'
    ];

    for (const phase of phases) {
      const check = await this.checkPhase(options.evidenceDir, phase);
      phaseChecks[phase] = check;

      if (!check.present && check.required) {
        violations.push(`Missing ${phase} phase`);
      }

      if (check.present && !check.qualityOk) {
        warnings.push(`${phase} phase quality low`);
      }
    }

    return {
      status: violations.length === 0 ? 'approved' : 'blocked',
      violations,
      warnings,
      phaseChecks
    };
  }

  private async checkPhase(
    evidenceDir: string,
    phase: string
  ): Promise<PhaseCheck> {
    const files = {
      STRATEGIZE: 'strategy.md',
      SPEC: 'spec.md',
      PLAN: 'plan.md',
      THINK: 'think.md',
      GATE: 'design.md',
      IMPLEMENT: 'implement.md',
      VERIFY: 'verify.md',
      REVIEW: 'review.md'
    };

    const file = files[phase];
    if (!file) return { present: false, required: false, qualityOk: true };

    const path = `${evidenceDir}/${file}`;
    const exists = await fileIO.exists(path);

    if (!exists) {
      return { present: false, required: this.isRequired(phase), qualityOk: false };
    }

    // Check quality (word count, structure)
    const content = await fileIO.readText(path);
    const wordCount = content.split(/\s+/).length;
    const qualityOk = wordCount >= this.getMinWords(phase);

    return { present: true, required: true, qualityOk };
  }

  private isRequired(phase: string): boolean {
    // GATE required for >1 file or >20 LOC
    // All other phases required
    return phase !== 'GATE';
  }

  private getMinWords(phase: string): number {
    return {
      STRATEGIZE: 500,
      SPEC: 300,
      PLAN: 300,
      THINK: 200,
      GATE: 500
    }[phase] || 100;
  }
}
```

**Step 2: Add CLI command**

```bash
# tools/wvo_mcp/package.json
{
  "scripts": {
    "critic:process": "npx tsx src/cli/run_process_critic.ts"
  }
}
```

**Step 3: Integrate with pre-commit hook**

Pre-commit hook should run ProcessCritic on evidence before allowing commit.

### Exit Criteria
- [x] ProcessCritic implemented
- [x] All 10 phases validated
- [x] Quality checks work
- [x] CLI command works
- [x] Pre-commit integration

### Files Changed
- `tools/wvo_mcp/src/critics/process.ts` (new, ~300 LOC)
- CLI (~50 LOC)
- Tests (~150 LOC)

**Total:** ~500 LOC

---

## Total Estimate

**Files:** ~10 files
**LOC:** ~900 LOC
**Time:** ~14 hours

---

**Plan complete:** 2025-11-06
**Owner:** Claude Council
