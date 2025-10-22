# Output DSL Specification

**Status**: Formalized (v1.0)
**Last Updated**: 2025-10-22
**Purpose**: Define the strict output format contract for orchestrator agent outputs

---

## Overview

WeatherVane's orchestrator agents must produce well-structured output that communicates execution status, progress, and next steps. This specification defines the **Output DSL (Domain-Specific Language)** that governs all agent outputs.

The Output DSL enforces both **syntactic** and **semantic** constraints to ensure:
- Consistent, machine-parseable outputs
- Reliable progress tracking and decision-making
- Safe forward progress even when agents fail
- Clear communication of blockers and failures

---

## Validation Layers

### Layer 1: Syntactic Validation
**Location**: `tools/wvo_mcp/src/utils/output_validator.ts:86-111`

Validates that output matches the JSON schema structure:
```typescript
const codexOutputSchema = z.object({
  completed_tasks: z.array(z.string()),
  in_progress: z.array(z.string()),
  blockers: z.array(z.string()),
  next_focus: z.array(z.string()),
  notes: z.string(),
}).strict();
```

**Guarantees**:
- Output is valid JSON
- All required fields present
- All fields have correct types
- No extra fields allowed (`.strict()`)
- Only ASCII characters allowed

**Error Codes**:
- `invalid_json` - JSON parsing failed
- `invalid_json_schema` - Schema mismatch
- `empty_json_output` - JSON output was empty
- `non_ascii_output` - Non-ASCII characters detected

---

### Layer 2: Semantic Validation (NEW)
**Location**: `tools/wvo_mcp/src/utils/output_validator.ts:215-501`

Validates logical constraints and data quality requirements beyond schema structure.

---

## Field Specifications

### Field: `completed_tasks`
**Type**: `string[]`
**Constraints**:
- Must be an array
- Can be empty (no completed tasks this cycle)
- Each item must be a string (task identifier)
- Items must be unique (no duplicates)
- Cannot appear in `in_progress`, `blockers`, or `next_focus`

**Validation Function**: `validateTaskListConsistency()`
**Error Code**: `task_list_conflict`

**Example**:
```json
{
  "completed_tasks": ["T9.1.2: Batch queue (COMPLETE)", "T9.2.0: Validation prep (COMPLETE)"]
}
```

---

### Field: `in_progress`
**Type**: `string[]`
**Constraints**:
- Must be an array
- Can be empty (no active work)
- Each item must be a string (task identifier)
- Items must be unique (no duplicates)
- Cannot appear in `completed_tasks`, `blockers`, or `next_focus`

**Validation Function**: `validateTaskListConsistency()`
**Error Code**: `task_list_conflict`

**Example**:
```json
{
  "in_progress": ["T9.2.1: Strict output DSL validation"]
}
```

---

### Field: `blockers`
**Type**: `string[]`
**Constraints**:
- Must be an array
- Can be empty (no blockers)
- Each item must be a string (blocker description)
- Items must be unique (no duplicates)
- Cannot appear in other task lists
- Should be human-readable and actionable

**Validation Function**: `validateArrayUniqueness()`
**Error Code**: `duplicate_items_detected` (warning)

**Example**:
```json
{
  "blockers": ["MCP service down (waiting for restart)", "Database connection timeout"]
}
```

---

### Field: `next_focus`
**Type**: `string[]`
**Constraints**:
- Must be an array
- **Must be non-empty** (always have forward progress planned)
- Each item must be a string (task identifier or description)
- Items must be unique (no duplicates)
- Cannot appear in `completed_tasks`, `in_progress`, or `blockers`
- Represents planned work for next iteration

**Validation Function**: `validateTaskListConsistency()`, `validateCodexOutputFields()`
**Error Code**: `next_focus_empty`, `task_list_conflict`

**Example**:
```json
{
  "next_focus": ["T9.2.1: Implement semantic validation", "T9.2.2: Add comprehensive tests"]
}
```

---

### Field: `notes`
**Type**: `string`
**Constraints**:
- Must be a non-empty string
- Must have meaningful content (not just whitespace)
- Maximum length: 5000 characters
- Should provide context on current state, decisions, and reasoning
- Can span multiple lines

**Validation Function**: `validateCodexOutputFields()`, `validateContentBoundaries()`
**Error Code**: `notes_empty`, `notes_not_string`, `content_boundary_exceeded`

**Example**:
```json
{
  "notes": "Implemented semantic validation layer with 5 constraint checks:\n1. Field presence validation\n2. Array uniqueness validation\n3. Task list consistency validation\n4. Content boundary validation\n5. Cross-field constraint validation\n\nAll tests passing (47/47). Ready for next phase."
}
```

---

## Content Boundaries

The DSL enforces maximum content sizes to prevent abuse and ensure efficiency:

| Field | Constraint | Reason |
|-------|-----------|--------|
| `notes` | ≤ 5000 characters | Reasonable summary limit |
| Each array | ≤ 50 items | Prevent unreasonable workload bloat |
| `completed_tasks` | ≤ 50 items | Per-cycle completed task limit |
| `in_progress` | ≤ 50 items | Prevent over-parallelization |
| `blockers` | ≤ 50 items | Keep blocker list manageable |
| `next_focus` | ≤ 50 items | Scope planning appropriately |

**Validation Function**: `validateContentBoundaries()`
**Error Code**: `content_boundary_exceeded`

---

## Output Format Detection

The orchestrator can produce two types of outputs:

### Format 1: JSON (Primary)
Codex agents output this format by default. Schema enforced by **Syntactic Validation Layer**.

```json
{
  "completed_tasks": ["Task A", "Task B"],
  "in_progress": ["Task C"],
  "blockers": [],
  "next_focus": ["Task D"],
  "notes": "Execution summary..."
}
```

### Format 2: Unified Diff (Secondary)
For agents that produce code changes directly. Structure validated by pattern matching.

```
*** Begin Patch
*** Update File: src/utils/output_validator.ts
[file contents and changes]
*** End Patch
```

**Validation**: Regex-based (see `validateDiff()` in output_validator.ts)

---

## Validation Error Hierarchy

Errors are categorized by severity:

### Errors (Block Execution)
Must be resolved before output is accepted:
- Field type mismatch: `*_not_array`, `*_not_string`
- Missing required content: `notes_empty`, `next_focus_empty`
- Data conflicts: `task_list_conflict`
- Boundary violations: `content_boundary_exceeded`
- Semantic failures: `semantic_validation_failed`

### Warnings (Advisory)
Recorded but do not block execution:
- Duplicate items: `duplicate_items_detected`
- These are tracked but allow execution to continue

---

## Strict Validation Workflow

The `strictValidateOutput()` function implements complete validation:

```typescript
export function strictValidateOutput(
  rawOutput: string,
  throwOnWarnings: boolean = false
): { data: CodexFinalSummary; semantics: SemanticValidationContext }
```

**Process**:
1. **Syntactic Validation**: `validateJSON()` - JSON schema check
2. **Field Validation**: `validateCodexOutputFields()` - Required fields present and correct type
3. **Uniqueness Check**: `validateArrayUniqueness()` - No duplicates within arrays
4. **Consistency Check**: `validateTaskListConsistency()` - No task appears in multiple lists
5. **Boundary Check**: `validateContentBoundaries()` - Sizes within limits

**Returns**:
- `data`: The validated `CodexFinalSummary` object
- `semantics`: Detailed validation context with all errors and warnings

**Throws**: `OutputValidationError` if errors found, or if warnings found and `throwOnWarnings=true`

---

## Validation State Model

The semantic validation context tracks validation state:

```typescript
interface SemanticValidationContext {
  errors: Array<{
    code: string;
    message: string;
    path: string;
    severity: 'warning' | 'error';
  }>;
  warnings: Array<{
    code: string;
    message: string;
    path: string;
  }>;
  isValid: boolean;
}
```

---

## Integration Points

### Orchestrator Integration
Location: `tools/wvo_mcp/src/orchestrator/operations_manager.ts`

Validation metrics tracked:
```typescript
validation: {
  totalFailures: number;
  failuresLastHour: number;
  recentFailureRate: number;
  failuresByCode: Record<string, number>;
  shadowFailures: number;
  enforcedFailures: number;
  mode: OutputValidationMode;
  canaryAcknowledged: boolean;
  retryRate: number;
  recoveries: { retries: number; reassignments: number; failures: number };
};
```

### Agent Coordinator Integration
Location: `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts`

Validation failure event:
```typescript
interface OutputValidationFailureEvent {
  task: Task;
  agent: Agent;
  output: string;
  error: string;
  mode?: string;
  agentType?: AgentType;
  code?: string;
  enforced?: boolean;
}
```

---

## Migration & Versioning

### Current Version
- **v1.0**: Initial strict validation specification
- **Release**: 2025-10-22
- **Scope**: JSON output only; diff validation not updated

### Future Versions
1. **v1.1**: Formal diff grammar (EBNF-based)
2. **v1.2**: Tool-specific output schemas
3. **v1.3**: Output transformation/normalization utilities
4. **v2.0**: Extended constraints for specific agent types

### Backward Compatibility
- All new validation is **strictly additive**
- Existing valid outputs remain valid
- New semantic checks may reject previously-accepted outputs (requires opt-in)

---

## Testing

Comprehensive test suite in: `tools/wvo_mcp/src/utils/output_validator.test.ts`

Test categories:
1. **Syntactic Validation Tests** (15+ tests)
   - Valid JSON structures
   - Schema compliance
   - ASCII enforcement
   - Format detection

2. **Semantic Validation Tests** (25+ tests)
   - Field presence requirements
   - Array uniqueness
   - Task list consistency
   - Content boundaries
   - Error collection and reporting

3. **Integration Tests** (10+ tests)
   - Strict validation wrapper
   - Warning handling
   - Error message formatting

---

## Examples

### Valid Output
```json
{
  "completed_tasks": ["T9.1.2: Batch queue"],
  "in_progress": ["T9.2.1: Validation"],
  "blockers": [],
  "next_focus": ["T9.2.2: Tests", "T9.2.3: Spec"],
  "notes": "Semantic validation complete. All 5 constraint checks passing. Ready for test suite implementation."
}
```

### Invalid Outputs

**Empty next_focus** (blocks forward progress):
```json
{
  "completed_tasks": ["T9.2.1"],
  "in_progress": [],
  "blockers": [],
  "next_focus": [],  // ERROR: Must be non-empty
  "notes": "Work done"
}
```

**Task in multiple lists** (state conflict):
```json
{
  "completed_tasks": ["Task A"],
  "in_progress": ["Task A"],  // ERROR: Already in completed_tasks
  "blockers": [],
  "next_focus": ["Task B"],
  "notes": "State error"
}
```

**Missing notes** (no context):
```json
{
  "completed_tasks": [],
  "in_progress": [],
  "blockers": [],
  "next_focus": ["Task"],
  "notes": ""  // ERROR: Cannot be empty
}
```

---

## FAQ

**Q: Can `next_focus` contain tasks already in `completed_tasks`?**
A: No. The validation function `validateTaskListConsistency()` ensures tasks appear in only one list. This prevents state confusion.

**Q: Why limit arrays to 50 items?**
A: To prevent agents from bloating output with excessive task lists. If an agent has >50 tasks in one category, it should consolidate or escalate to a supervisor.

**Q: What happens if an output has warnings but no errors?**
A: By default, warnings do not block execution (shadow mode). The `strictValidateOutput()` function records them in the context but allows output to be used. Set `throwOnWarnings=true` to fail on warnings.

**Q: Can the DSL evolve?**
A: Yes, but carefully. New fields or constraints should be added as **optional** initially, then migrated to required in a future major version.

**Q: How is the validation mode (disabled/shadow/enforce) determined?**
A: Via `resolveOutputValidationSettings()`:
- `WVO_OUTPUT_VALIDATION_MODE` env var: `disabled|shadow|enforce` (default: `shadow`)
- `WVO_OUTPUT_VALIDATION_CANARY` env var: must be `1|true` to enable enforce mode

---

## Summary

The Output DSL Specification defines a **strict, validated contract** for agent outputs in WeatherVane's orchestrator. It combines:
- **Syntactic validation**: JSON schema compliance
- **Semantic validation**: Logical constraints and data quality
- **Boundary validation**: Content size limits
- **Error categorization**: Clear severity levels

This ensures reliable execution, transparent progress tracking, and safe forward momentum even during partial failures.
