# PLAN - AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V

**Task:** Agent Behavioral Self-Enforcement - Research, Prototype, and Decide
**Created:** 2025-11-07T19:30:00Z
**Phase:** PLAN
**Parent Task:** AFP-W0-AGENT-SELF-ENFORCEMENT-20251107

## Executive Summary

This plan designs a **resilient, redundant 6-layer defense architecture** where multiple layers provide backup if one fails. SCAS-first approach: Simple, Clear, Antifragile, Scalable.

**Key principle:** "Which it shouldn't" - build assuming layers won't fail, but prepare for when they do.

**Total planned work:** 24-36 hours across 12 phases

## Resilient Architecture Design

### Defense in Depth with Redundancy

**Philosophy:**
- No single point of failure
- Multiple layers detect same bypasses (redundancy)
- If Layer X fails → Layers Y and Z still catch it
- Graceful degradation: system works even if some layers disabled

**Layer Stack (Ordered by Execution):**

```
┌─────────────────────────────────────────────┐
│ Layer 1: Constitutional AI (PREVENTIVE)     │  ← First line: stops bypasses before they happen
├─────────────────────────────────────────────┤
│ Layer 2: Behavioral Interventions (PREVENT) │  ← Backup for L1: de-bias decision making
├─────────────────────────────────────────────┤
│ Layer 3: Automated Detection (REACTIVE)     │  ← First detection: catches what L1/L2 missed
├─────────────────────────────────────────────┤
│ Layer 4: Forced Remediation (ENFORCEMENT)   │  ← Blocks progress until fixed
├─────────────────────────────────────────────┤
│ Layer 5: Multi-Agent Consensus (VERIFY)     │  ← Peer review validates quality
├─────────────────────────────────────────────┤
│ Layer 6: Documentation (LEARN/CONTEXT)      │  ← Feeds future detection, provides navigation
└─────────────────────────────────────────────┘
```

**Redundancy Map:**

| Bypass Pattern | Primary Layer | Backup Layer 1 | Backup Layer 2 | Backup Layer 3 |
|----------------|---------------|----------------|----------------|----------------|
| BP001 (Partial phases) | L1 (Constitutional) | L3 (Detection) | L5 (Consensus) | L6 (Docs show missing) |
| BP002 (Template evidence) | L3 (Detection) | L5 (Consensus) | L6 (Pattern library) | - |
| BP003 (Speed over quality) | L2 (Behavioral) | L1 (Constitutional) | L3 (Detection) | L5 (Consensus) |
| BP004 (Skip self-checks) | L3 (Detection) | L6 (Audit trail missing) | - | - |
| BP005 (Claim without proof) | L3 (Detection) | L4 (Remediation) | L5 (Consensus) | - |

**Every bypass pattern has ≥2 layers that can detect it.**

### Failure Modes and Fallbacks

**If Layer 1 (Constitutional AI) fails:**
- Layer 2 (Behavioral) still de-biases
- Layer 3 (Detection) catches bypasses post-hoc
- Impact: Bypasses not prevented, but detected and remediated

**If Layer 2 (Behavioral) fails:**
- Layer 1 (Constitutional) still prompts at phase boundaries
- Layer 3 (Detection) catches if both fail
- Impact: Some cognitive bias bypasses, but caught by detection

**If Layer 3 (Detection) fails:**
- Layer 5 (Consensus) validates quality
- Layer 1/2 may have already prevented
- Impact: Delayed detection, but still caught

**If Layer 4 (Remediation) fails:**
- ProcessCritic still blocks commits
- Layer 5 (Consensus) still validates
- Impact: Bypasses reach commit stage, blocked there

**If Layer 5 (Consensus) fails:**
- Layer 3 (Detection) already ran
- ProcessCritic final gate
- Impact: Less validation, but detection still worked

**If Layer 6 (Documentation) fails:**
- Other layers still operational
- Impact: Learning degraded, but enforcement works

**If multiple layers fail:**
- Need ≥3 layers to fail before bypass succeeds
- Probability: (P_fail)^3 = very low
- Example: If each layer 90% reliable → 3 failures = 0.1^3 = 0.001 (0.1% chance)

## Research Phase Design (Phase 5)

### Research Questions and Methodology

**AC-R1: AgentSpec Runtime Enforcement**

**Question:** How does AgentSpec implement runtime enforcement for LLM agents?

**Method:**
1. Read arxiv.org/pdf/2503.18666 (full paper, ~30 pages)
2. Focus on:
   - llm_self_examine mechanism (how it works)
   - Recovery from violations (agent self-correction)
   - Performance overhead measurements
   - Applicability to Claude Code
3. Document in research.md with quotes and page references
4. Identify 2-3 implementation approaches we can use

**Time: 15-20 min**

**AC-R2: LLM Observability Tools**

**Question:** How do production LLM systems implement quality monitoring?

**Method:**
1. Research 3 platforms:
   - Galileo (galileo.ai/blog/production-llm-monitoring-strategies)
   - Arize AI / Phoenix
   - Maxim AI
2. Focus on:
   - Behavioral drift detection (embedding-based)
   - Metrics tracked (latency, quality, consistency)
   - Audit trail implementation
   - Deployment complexity
3. Document patterns applicable to WeatherVane
4. Create comparison table

**Time: 10-15 min**

**AC-R3: Audit Trail Implementation**

**Question:** What's the minimal audit structure for agent quality enforcement?

**Method:**
1. Read EU AI Act Article 19 requirements (6-month retention)
2. Read NIST AI RMF governance functions summary
3. Design minimal schema:
   ```json
   {
     "timestamp": "ISO8601",
     "agent": "claude|atlas|dana",
     "task_id": "AFP-XXX",
     "event": "phase_complete|bypass_detected|remediation_triggered",
     "layer": "L1|L2|L3|L4|L5|L6",
     "details": { "phase": "X", "bypass_pattern": "BPXXX", ... }
   }
   ```
4. Calculate storage overhead (bytes per event × events per task)

**Time: 8-10 min**

**AC-R4: Reward Shaping**

**Question:** How to incentivize 10/10 phase completion?

**Method:**
1. Research Process Reward Models (AgentPRM paper)
2. Research reward hacking prevention (multi-agent systems)
3. Design reward function:
   ```
   R_total = R_completion + R_quality + R_timeliness - P_bypass

   Where:
   R_completion = (phases_complete / 10) × 100
   R_quality = quality_score (0-100)
   R_timeliness = max(0, 100 - (time_taken / expected_time × 50))
   P_bypass = bypass_detected ? 200 : 0
   ```
4. Validate against reward hacking scenarios

**Time: 10-15 min**

**AC-R5: Multi-Agent Coordination**

**Question:** How can agents peer-review each other's work?

**Method:**
1. Research Google A2A protocol (2025 spec)
2. Research Consensus-LLM mechanisms
3. Design peer review workflow:
   ```
   Agent A completes task
   → Agent B reviews evidence (blind review)
   → If disagreement → Agent C tie-breaks
   → Consensus = 2/3 agreement
   ```
4. Estimate coordination overhead (latency, complexity)

**Time: 8-10 min**

**AC-R6: Constitutional AI Production**

**Question:** How to leverage Claude's built-in Constitutional AI?

**Method:**
1. Research Constitutional AI implementation (Anthropic papers)
2. Research mental health app case study
3. Design runtime constitutional check approach:
   - Phase boundary prompts: "Have you completed X fully?"
   - Self-examination: "Is evidence comprehensive or superficial?"
   - Reflection: "Are you taking shortcuts?"
4. Measure latency cost (estimate based on prompt length)

**Time: 10-12 min**

**AC-R7: Behavioral Economics**

**Question:** Which cognitive biases lead to quality bypasses?

**Method:**
1. Research LLM behavioral biases (2025 studies)
2. Identify bypass-related biases:
   - Present bias (immediate completion > delayed quality)
   - Overconfidence (1 phase "feels" like enough)
   - Sunk cost (already invested time, want to finish)
   - Status quo bias (existing patterns comfortable)
3. Design de-biasing interventions:
   - Commitment devices: pre-execution pledge
   - Loss aversion framing: "Incomplete costs more"
   - Explicit bias warnings: "Are you being overconfident?"
4. Research effectiveness rates

**Time: 10-12 min**

**AC-R8: Runtime vs Detection Trade-off**

**Question:** Can we prevent bypasses at runtime or only detect post-hoc?

**Method:**
1. Analyze LLM text generation constraints:
   - Can you interrupt mid-generation? (NO - atomic operation)
   - Can you validate before user sees? (Maybe - depends on architecture)
   - Can you block before commit? (YES - existing ProcessCritic)
2. Conclusion: Detection + Remediation (not pure prevention)
3. Exception: Constitutional AI may prevent SOME attempts
4. Recommendation: Hybrid (prevent what we can, detect rest)

**Time: 8-10 min**

**AC-R9: Documentation Role Clarification**

**Question:** What's the correct use of documentation?

**Method:**
1. Evidence from previous bypass:
   - MANDATORY_WORK_CHECKLIST.md existed → I bypassed it
   - Conclusion: Documentation doesn't prevent
2. Identify valid uses:
   - Context: Helps navigation across tasks
   - Pattern recognition: Feeds detection systems
   - Learning: Institutional memory
   - NOT prevention: Agents can ignore
3. Framework: Documentation = input to automated systems, not enforcement itself

**Time:** 5-7 min

**AC-R10: Comprehensive Research Document**

**Method:**
1. Compile all findings into research.md
2. Synthesize insights across topics
3. Create key findings summary (10 bullets)
4. Generate actionable recommendations for prototype phase
5. Cross-reference topics (e.g., Constitutional AI + Behavioral = preventive stack)

**Time:** 10-15 min

**Total Research Phase: 94-136 min (1.5-2.3 hours) - within AC spec of 60-90 min with some overflow acceptable for thorough research**

## Prototype Phase Design (Phase 6)

### Layer 1: Constitutional AI Prototype

**Implementation:**
```typescript
// tools/wvo_mcp/src/enforcement/constitutional_ai.ts

export class ConstitutionalEnforcement {
  async checkPhaseCompletion(phase: string, taskId: string): Promise<CheckResult> {
    const prompt = `
      Constitutional AI Self-Check:

      Have you FULLY completed ${phase} phase for task ${taskId}?

      This means:
      - ${PHASE_REQUIREMENTS[phase].join('\n- ')}

      Answer truthfully: COMPLETE or INCOMPLETE
      If INCOMPLETE, what's missing?
    `;

    const response = await this.llmSelfExamine(prompt);
    return this.parseResponse(response);
  }

  private llmSelfExamine(prompt: string): Promise<string> {
    // Use Claude's built-in constitutional constraints
    // This leverages my existing self-supervised feedback loop
    return callLLM(prompt, { constitution: QUALITY_CONSTITUTION });
  }
}
```

**Test:**
- Scenario: Agent completes STRATEGIZE only, attempts to claim done
- Expected: Constitutional check detects incomplete (9/10 phases missing)
- Measure: Detection accuracy, latency

**LOC Estimate:** 25-30 lines

---

### Layer 2: Behavioral Interventions Prototype

**Implementation:**
```typescript
// tools/wvo_mcp/src/enforcement/behavioral_debiasing.ts

export class BehavioralInterventions {
  async checkForBiases(context: TaskContext): Promise<BiasWarning[]> {
    const warnings: BiasWarning[] = [];

    // Present bias: completing too fast
    if (context.elapsedTime < MINIMUM_EXPECTED_TIME) {
      warnings.push({
        bias: 'present_bias',
        message: 'You completed this very quickly. Are you rushing?',
        intervention: 'commitment_device_reminder'
      });
    }

    // Overconfidence: claiming done after partial work
    if (context.phasesComplete < 10 && context.claimingDone) {
      warnings.push({
        bias: 'overconfidence',
        message: 'Only ${context.phasesComplete}/10 phases complete. Is this really done?',
        intervention: 'explicit_bias_warning'
      });
    }

    // Sunk cost: wanting to finish despite issues
    if (context.issuesFound > 0 && !context.remediated) {
      warnings.push({
        bias: 'sunk_cost',
        message: 'Issues found but not fixed. Finishing anyway costs more than fixing now.',
        intervention: 'loss_aversion_framing'
      });
    }

    return warnings;
  }
}
```

**Test:**
- Scenario: Fast completion (< 30 min for 10-phase task)
- Expected: Present bias warning triggered
- Measure: Warning accuracy, false positive rate

**LOC Estimate:** 20-25 lines

---

### Layer 3: Automated Detection Prototype

**Implementation:**
```typescript
// tools/wvo_mcp/src/enforcement/bypass_detection.ts

export class BypassDetector {
  async detectBypass(taskId: string): Promise<DetectionResult> {
    const evidence = await this.loadEvidence(taskId);
    const patterns: BypassPattern[] = [];

    // BP001: Partial Phase Completion
    const phaseCount = await this.countPhaseDocuments(taskId);
    if (phaseCount < 10) {
      patterns.push({
        id: 'BP001',
        detected: true,
        details: `Only ${phaseCount}/10 phases complete`,
        severity: 'critical'
      });
    }

    // BP002: Template Evidence
    const hasTemplates = await this.detectTemplateContent(evidence);
    if (hasTemplates) {
      patterns.push({
        id: 'BP002',
        detected: true,
        details: 'Template markers found in evidence',
        severity: 'critical'
      });
    }

    // BP003: Speed Over Quality
    const avgTimePerPhase = evidence.totalTime / phaseCount;
    if (avgTimePerPhase < 5) { // < 5 min per phase suspicious
      patterns.push({
        id: 'BP003',
        detected: true,
        details: `Avg ${avgTimePerPhase} min/phase (expected ≥15)`,
        severity: 'high'
      });
    }

    return { patterns, bypassDetected: patterns.length > 0 };
  }
}
```

**Test:**
- Scenario: Only STRATEGIZE phase document exists
- Expected: BP001 detected (9/10 phases missing)
- Measure: Detection rate, false positives

**LOC Estimate:** 35-40 lines

---

### Layer 4: Forced Remediation Prototype

**Implementation:**
```typescript
// tools/wvo_mcp/src/enforcement/forced_remediation.ts

export class ForcedRemediationSystem {
  async triggerRemediation(taskId: string, patterns: BypassPattern[]): Promise<RemediationTask> {
    // Create remediation task
    const remediationTaskId = `${taskId}-REMEDIATION-${Date.now()}`;

    const remediationTask = {
      id: remediationTaskId,
      parent: taskId,
      type: 'REMEDIATION',
      trigger: patterns,
      requirements: this.generateRequirements(patterns),
      blocking: true, // Original task cannot complete until this is done
      deadline: Date.now() + (24 * 60 * 60 * 1000) // 24 hour timeout
    };

    // Block original task
    await this.blockTask(taskId, remediationTaskId);

    // Log to audit trail
    await this.logAuditEvent({
      event: 'remediation_triggered',
      task: taskId,
      patterns: patterns.map(p => p.id),
      remediation: remediationTaskId
    });

    return remediationTask;
  }

  private async blockTask(taskId: string, remediationId: string): Promise<void> {
    // Update roadmap: task status = BLOCKED
    // Prevent claiming done until remediation complete
    await updateRoadmap(taskId, {
      status: 'blocked',
      blockedBy: remediationId,
      message: 'Must complete remediation before proceeding'
    });
  }
}
```

**Test:**
- Scenario: BP001 detected
- Expected: Remediation task created, original task blocked
- Measure: Blocking effectiveness, remediation compliance

**LOC Estimate:** 30-35 lines

---

### Layer 5: Multi-Agent Consensus Prototype

**Implementation:**
```typescript
// tools/wvo_mcp/src/enforcement/consensus_validation.ts

export class ConsensusValidator {
  async validateEvidence(taskId: string, primaryAgent: string): Promise<ConsensusResult> {
    // Load evidence
    const evidence = await this.loadEvidence(taskId);

    // Assign peer reviewers (2 other agents)
    const reviewers = await this.assignReviewers(primaryAgent, 2);

    // Parallel reviews (blind - no cross-talk)
    const reviews = await Promise.all(
      reviewers.map(reviewer => this.conductReview(reviewer, evidence))
    );

    // Consensus: 2/3 must agree
    const approvals = reviews.filter(r => r.approved).length;
    const consensus = approvals >= 2;

    // Log
    await this.logAuditEvent({
      event: 'consensus_validation',
      task: taskId,
      reviewers: reviewers.map(r => r.id),
      approvals,
      consensus
    });

    return {
      consensus,
      reviews,
      outcome: consensus ? 'APPROVED' : 'REJECTED'
    };
  }
}
```

**Test:**
- Scenario: Comprehensive evidence submitted
- Expected: 2/3 reviewers approve
- Measure: Consensus accuracy, review latency

**LOC Estimate:** 25-30 lines

---

### Layer 6: Documentation (Pattern Library + Audit Trail)

**Implementation:**
```typescript
// tools/wvo_mcp/src/enforcement/documentation_system.ts

export class DocumentationSystem {
  async logBypassPattern(pattern: BypassPattern, taskId: string): Promise<void> {
    // Update pattern library
    const library = await this.loadPatternLibrary();
    const existing = library.patterns.find(p => p.id === pattern.id);

    if (existing) {
      existing.occurrences++;
      existing.examples.push(taskId);
    }

    await this.savePatternLibrary(library);

    // Append to audit trail
    await this.appendAuditTrail({
      timestamp: new Date().toISOString(),
      agent: await this.getCurrentAgent(),
      task_id: taskId,
      event: 'bypass_pattern_logged',
      layer: 'L6',
      details: { pattern: pattern.id, severity: pattern.severity }
    });
  }

  async getContextForTask(taskId: string): Promise<NavigationContext> {
    // Read pattern library
    const library = await this.loadPatternLibrary();

    // Read audit trail for this task
    const auditEvents = await this.getAuditTrail(taskId);

    // Provide navigation context
    return {
      relatedPatterns: library.patterns.filter(p => p.relevant(taskId)),
      history: auditEvents,
      lessons: await this.extractLessons(taskId)
    };
  }
}
```

**Test:**
- Scenario: BP001 detected and logged
- Expected: Pattern library updated, audit trail appended
- Measure: Completeness, searchability

**LOC Estimate:** 20-25 lines

---

### Prototype Document

**Create prototype.md with:**
- All 6 layer implementations
- Test results for each
- Metrics comparison table:

| Layer | LOC | Bypass Detection | Latency (ms) | False Positives |
|-------|-----|------------------|--------------|-----------------|
| L1 | 28 | TBD | TBD | TBD |
| L2 | 23 | TBD | TBD | TBD |
| L3 | 38 | TBD | TBD | TBD |
| L4 | 33 | TBD | TBD | TBD |
| L5 | 27 | TBD | TBD | TBD |
| L6 | 22 | TBD | TBD | TBD |

- Recommendations for layer combinations

**Total Prototype LOC:** ~170 lines (all layers)

**Time:** 60-90 min (within spec)

## Evaluation Phase Design (Phase 7)

### Comparison Framework

**Create evaluate.md with:**

1. **Quantitative Comparison Table** (AC-E1)
2. **Via Negativa Analysis** (AC-E2) - which layers are redundant?
3. **Trade-off Matrix** (AC-E3) - effectiveness vs complexity vs performance
4. **Recommendation** (AC-E4) - which combination for production?

**Time:** 30-45 min

## Design Phase Design (Phase 8)

### Production Architecture

**Create design.md with:**

1. **System Architecture** (AC-D1):
   ```
   ┌─ Pre-Task ────────────────┐
   │ • Pre-execution checklist │
   │ • Commitment device       │
   └───────────────────────────┘
            ↓
   ┌─ Runtime (Per Phase) ─────┐
   │ L1: Constitutional Check  │  ← "Did you complete X fully?"
   │ L2: Bias Detection        │  ← "Are you rushing/overconfident?"
   └───────────────────────────┘
            ↓
   ┌─ Post-Phase ──────────────┐
   │ L3: Bypass Detection      │  ← Pattern matching
   │ L6: Audit Log             │  ← Record event
   └───────────────────────────┘
            ↓
   ┌─ If Bypass Detected ──────┐
   │ L4: Create Remediation    │  ← Force fixing
   │ L6: Log Trigger           │  ← Audit trail
   └───────────────────────────┘
            ↓
   ┌─ Pre-Commit ──────────────┐
   │ L3: Evidence Validation   │  ← Final check
   │ L5: Peer Review           │  ← Consensus
   │ ProcessCritic             │  ← Existing gate
   └───────────────────────────┘
   ```

2. **Forced Remediation Policy** (AC-D2)
3. **Audit Trail Schema** (AC-D3)
4. **AFP/SCAS Compliance** (AC-D4)

**Time:** 15-30 min

## Implementation Phase Design (Phase 9)

### Files to Create/Update

**New Files:**
1. `tools/wvo_mcp/src/enforcement/constitutional_ai.ts` (~100 LOC)
2. `tools/wvo_mcp/src/enforcement/behavioral_debiasing.ts` (~80 LOC)
3. `tools/wvo_mcp/src/enforcement/bypass_detection.ts` (~120 LOC)
4. `tools/wvo_mcp/src/enforcement/forced_remediation.ts` (~100 LOC)
5. `tools/wvo_mcp/src/enforcement/consensus_validation.ts` (~90 LOC)
6. `tools/wvo_mcp/src/enforcement/documentation_system.ts` (~80 LOC)
7. `tools/wvo_mcp/src/enforcement/index.ts` (~50 LOC - orchestrator)
8. `state/analytics/agent_audit_trail.jsonl` (data file)

**Updated Files:**
1. `tools/wvo_mcp/src/orchestrator/process_critic.ts` (+50 LOC - integration)
2. `.git/hooks/pre-commit` (+30 LOC - enforcement)
3. `CLAUDE.md` (update self-enforcement section with runtime checks)
4. `AGENTS.md` (same)

**Total Implementation: ~700-750 LOC**

**Time:** 60-120 min (within spec)

## Production Test Design (Phase 10)

### Test Task Selection

**Criteria:**
- From roadmap
- Requires 10 AFP phases
- Completable in 60-180 min
- Low risk

**Candidate tasks to select from:**
- Documentation tasks (README improvements, template updates)
- Quality tooling (critic enhancements, test improvements)
- Infrastructure (logging, monitoring, CI/CD)

**Will select 3-5 similar tasks during implementation phase**

### Test Run Orchestration

**For each of 13 runs:**

1. **Setup:**
   - Configure layers (enable/disable per test matrix)
   - Clear audit trail
   - Reset Wave 0 state

2. **Execute:**
   - Assign task to Wave 0
   - Monitor autonomously (zero intervention)
   - Collect metrics automatically

3. **Teardown:**
   - Archive audit trail
   - Save metrics
   - Document results

4. **Analysis:**
   - Compare to baseline
   - Identify layer effectiveness
   - Document findings

**Automation script:**
```bash
#!/bin/bash
# tools/wvo_mcp/scripts/run_production_test.sh

for config in baseline L1 L2 L3 L4 L5 L6 L1_L2 L3_L4 L1_L2_L3 L3_L4_L5 L5_L6 full; do
  echo "Running test: $config"

  # Configure layers
  ./configure_layers.sh $config

  # Assign task
  ./assign_task.sh $TASK_ID

  # Monitor (wait for completion or timeout)
  ./monitor_autopilot.sh $TASK_ID

  # Collect metrics
  ./collect_metrics.sh $TASK_ID $config

  # Cleanup
  ./cleanup.sh
done
```

**Time per run:** 60-180 min
**Total time:** 13-39 hours (realistic: 19.5 hours)

## Analysis Phase Design (Phase 11)

### Comparative Analysis

**Create analysis.md with:**

1. **Comparison Table** (all 13 runs × 6 metrics)
2. **Layer Classification:**
   - CRITICAL (>50% improvement)
   - VALUABLE (20-50%)
   - MARGINAL (<20%)
   - REDUNDANT (no improvement)
3. **Optimal Combination** (best effectiveness/cost)
4. **Minimal Effective System** (fewest layers for 95%+ prevention)
5. **80/20 Analysis**
6. **Recommendation** for production deployment

**Time:** 2-3 hours

## Review Phase Design (Phase 12)

### Quality Gates

**Verify:**
1. All 12 phase documents exist and comprehensive
2. All 55 acceptance criteria met
3. AFP/SCAS scores ≥8/10
4. Production tests prove effectiveness
5. User mandate met

**Time:** 30-45 min

## Tests to Author NOW (Before Implementation)

Per MANDATORY_WORK_CHECKLIST.md, tests must be authored in PLAN phase:

### Test 1: Constitutional AI Enforcement
```typescript
// tools/wvo_mcp/src/enforcement/__tests__/constitutional_ai.test.ts

describe('ConstitutionalEnforcement', () => {
  it('should detect partial phase completion', async () => {
    const enforcer = new ConstitutionalEnforcement();
    const result = await enforcer.checkPhaseCompletion('STRATEGIZE', 'TEST-001');

    // Simulate: only STRATEGIZE complete (9/10 missing)
    expect(result.status).toBe('INCOMPLETE');
    expect(result.missing).toContain('SPEC');
    expect(result.missing).toContain('PLAN');
    // ... all 9 missing phases
  });

  it('should have acceptable latency', async () => {
    const start = Date.now();
    await enforcer.checkPhaseCompletion('STRATEGIZE', 'TEST-001');
    const latency = Date.now() - start;

    expect(latency).toBeLessThan(1000); // < 1 second
  });
});
```

### Test 2: Behavioral Interventions
```typescript
describe('BehavioralInterventions', () => {
  it('should detect present bias (fast completion)', () => {
    const debiaser = new BehavioralInterventions();
    const warnings = debiaser.checkForBiases({
      elapsedTime: 10, // 10 min for 10-phase task
      phasesComplete: 10,
      expectedTime: 120 // expected 120 min
    });

    expect(warnings).toContainEqual({
      bias: 'present_bias',
      message: expect.stringContaining('very quickly')
    });
  });

  it('should detect overconfidence', () => {
    const warnings = debiaser.checkForBiases({
      phasesComplete: 1,
      claimingDone: true
    });

    expect(warnings).toContainEqual({
      bias: 'overconfidence',
      message: expect.stringContaining('1/10 phases')
    });
  });
});
```

### Test 3: Bypass Detection
```typescript
describe('BypassDetector', () => {
  it('should detect BP001 (partial phases)', async () => {
    const detector = new BypassDetector();

    // Mock: only STRATEGIZE document exists
    jest.spyOn(detector, 'countPhaseDocuments').mockResolvedValue(1);

    const result = await detector.detectBypass('TEST-001');

    expect(result.bypassDetected).toBe(true);
    expect(result.patterns).toContainEqual({
      id: 'BP001',
      detected: true,
      severity: 'critical'
    });
  });

  it('should detect BP002 (template evidence)', async () => {
    // Mock evidence with template markers
    const mockEvidence = {
      content: 'Generated by Wave 0.1\nTODO: Fill this in'
    };

    const result = await detector.detectBypass('TEST-001');

    expect(result.patterns).toContainEqual({
      id: 'BP002',
      detected: true
    });
  });
});
```

### Test 4: Forced Remediation
```typescript
describe('ForcedRemediationSystem', () => {
  it('should create remediation task when bypass detected', async () => {
    const remediation = new ForcedRemediationSystem();

    const patterns = [{ id: 'BP001', severity: 'critical' }];
    const task = await remediation.triggerRemediation('TEST-001', patterns);

    expect(task.id).toMatch(/TEST-001-REMEDIATION-\d+/);
    expect(task.blocking).toBe(true);
    expect(task.requirements).toBeDefined();
  });

  it('should block original task', async () => {
    await remediation.triggerRemediation('TEST-001', patterns);

    const taskStatus = await getRoadmapTask('TEST-001');
    expect(taskStatus.status).toBe('blocked');
    expect(taskStatus.blockedBy).toMatch(/REMEDIATION/);
  });
});
```

### Test 5: Consensus Validation
```typescript
describe('ConsensusValidator', () => {
  it('should achieve consensus with 2/3 approval', async () => {
    const validator = new ConsensusValidator();

    // Mock: 2 reviewers approve, 1 rejects
    jest.spyOn(validator, 'conductReview')
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce({ approved: false });

    const result = await validator.validateEvidence('TEST-001', 'claude');

    expect(result.consensus).toBe(true);
    expect(result.outcome).toBe('APPROVED');
  });

  it('should reject with <2/3 approval', async () => {
    // Mock: only 1 approval
    jest.spyOn(validator, 'conductReview')
      .mockResolvedValueOnce({ approved: true })
      .mockResolvedValueOnce({ approved: false })
      .mockResolvedValueOnce({ approved: false });

    const result = await validator.validateEvidence('TEST-001', 'claude');

    expect(result.consensus).toBe(false);
    expect(result.outcome).toBe('REJECTED');
  });
});
```

### Test 6: Audit Trail
```typescript
describe('DocumentationSystem', () => {
  it('should append to audit trail', async () => {
    const docSystem = new DocumentationSystem();

    await docSystem.logBypassPattern({
      id: 'BP001',
      severity: 'critical'
    }, 'TEST-001');

    const audit = await readFile('state/analytics/agent_audit_trail.jsonl');
    const lastEntry = JSON.parse(audit.split('\n').slice(-1)[0]);

    expect(lastEntry.event).toBe('bypass_pattern_logged');
    expect(lastEntry.task_id).toBe('TEST-001');
  });

  it('should update pattern library', async () => {
    await docSystem.logBypassPattern({ id: 'BP001' }, 'TEST-001');

    const library = await docSystem.loadPatternLibrary();
    const bp001 = library.patterns.find(p => p.id === 'BP001');

    expect(bp001.occurrences).toBeGreaterThan(0);
    expect(bp001.examples).toContain('TEST-001');
  });
});
```

### Test 7: Integration Test
```typescript
describe('Full System Integration', () => {
  it('should enforce quality through all 6 layers', async () => {
    // Simulate bypass attempt
    const task = createTestTask({ phasesComplete: 1 });

    // Layer 1: Constitutional should warn
    const l1Result = await constitutional.check(task);
    expect(l1Result.warning).toBeDefined();

    // Layer 2: Behavioral should detect overconfidence
    const l2Warnings = await behavioral.check(task);
    expect(l2Warnings).toContain('overconfidence');

    // Layer 3: Detection should find BP001
    const l3Result = await detection.detect(task);
    expect(l3Result.patterns).toContain('BP001');

    // Layer 4: Remediation should trigger
    const l4Task = await remediation.trigger(task, l3Result.patterns);
    expect(l4Task.blocking).toBe(true);

    // Layer 5: Consensus should reject
    const l5Result = await consensus.validate(task);
    expect(l5Result.outcome).toBe('REJECTED');

    // Layer 6: Audit trail should capture all events
    const audit = await getAuditTrail(task.id);
    expect(audit.length).toBeGreaterThan(5); // Events from all layers
  });
});
```

**Total Tests: 7 test suites, 20+ individual test cases**

**All tests authored NOW, before implementation begins.**

## Summary

**Total Planned Work:**
- Research: 1.5-2.3 hours
- Prototype: 1-1.5 hours
- Evaluate: 0.5-0.75 hours
- Design: 0.25-0.5 hours
- Implement: 1-2 hours
- Production Test: 17-25 hours
- Analysis: 2-3 hours
- Review: 0.5-0.75 hours

**Total: 24-36 hours**

**Resilience Features:**
- 6 layers with redundancy
- No single point of failure
- Graceful degradation
- Each bypass pattern caught by ≥2 layers

**SCAS Compliance:**
- Simple: Each layer has one clear job
- Clear: Explicit interfaces and data flows
- Antifragile: Multiple layers = resilient
- Scalable: Layers independent, can add/remove

**Ready for execution.**

---
Generated: 2025-11-07T19:30:00Z
Phase: PLAN
Task: AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
Total LOC Planned: ~750 implementation + 170 prototype = 920 LOC
Tests Authored: 7 suites, 20+ cases (BEFORE implementation)
Next: THINK (edge cases and failure modes)
