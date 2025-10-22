import { z } from 'zod';

export type OutputFormat = 'json' | 'diff';
export type OutputValidationMode = 'disabled' | 'shadow' | 'enforce';

export interface OutputValidationSettings {
  configuredMode: OutputValidationMode;
  effectiveMode: OutputValidationMode;
  canaryAcknowledged: boolean;
}

export class OutputValidationError extends Error {
  readonly code: string;
  readonly severity: 'warning' | 'error';

  constructor(code: string, message: string, severity: 'warning' | 'error' = 'error') {
    super(message);
    this.name = 'OutputValidationError';
    this.code = code;
    this.severity = severity;
  }
}

/**
 * Semantic validation context for output DSL constraints.
 * Tracks detailed violations across multiple validation passes.
 */
export interface SemanticValidationContext {
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

export function createSemanticValidationContext(): SemanticValidationContext {
  return {
    errors: [],
    warnings: [],
    isValid: true,
  };
}

const ASCII_CONTROL_REGEX = /[^\x09\x0A\x0D\x20-\x7E]/;
const BEGIN_PATCH_REGEX = /^\*\*\* Begin Patch/m;
const END_PATCH_REGEX = /^\*\*\* End Patch/m;
const FILE_DIRECTIVE_REGEX = /^\*\*\* (Add|Update|Delete) File:/m;
const DELETE_DIRECTIVE_REGEX = /^\*\*\* Delete File:/m;
const GIT_DIFF_HEADER_REGEX = /^diff --git a\/.+ b\/.+$/m;
const HUNK_HEADER_REGEX = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/m;
const CHANGE_LINE_REGEX = /^(?:\+(?!\+\+)|-(?!-)).+/m;
const FILE_HEADER_LINE_REGEX = /^(?:---|\+\+\+)\s/m;

const codexOutputSchema = z
  .object({
    completed_tasks: z.array(z.string()),
    in_progress: z.array(z.string()),
    blockers: z.array(z.string()),
    next_focus: z.array(z.string()),
    notes: z.string(),
  })
  .strict();

function ensureAscii(content: string): void {
  if (ASCII_CONTROL_REGEX.test(content)) {
    throw new OutputValidationError(
      'non_ascii_output',
      'Output contains non-ASCII characters; enforce ASCII to keep transport reliable.'
    );
  }
}

export type CodexFinalSummary = z.infer<typeof codexOutputSchema>;

function normalizeBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

export function resolveOutputValidationSettings(): OutputValidationSettings {
  const rawMode = process.env.WVO_OUTPUT_VALIDATION_MODE?.trim().toLowerCase();
  let configuredMode: OutputValidationMode;
  switch (rawMode) {
    case 'disabled':
      configuredMode = 'disabled';
      break;
    case 'enforce':
      configuredMode = 'enforce';
      break;
    case 'shadow':
    default:
      configuredMode = 'shadow';
      break;
  }

  const canaryAcknowledged = normalizeBoolean(process.env.WVO_OUTPUT_VALIDATION_CANARY);
  const effectiveMode =
    configuredMode === 'enforce' && !canaryAcknowledged ? 'shadow' : configuredMode;

  return {
    configuredMode,
    effectiveMode,
    canaryAcknowledged,
  };
}

export function validateJSON(rawOutput: string): CodexFinalSummary {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new OutputValidationError('empty_json_output', 'Output is empty; expected codex_output_schema JSON.');
  }

  ensureAscii(trimmed);

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OutputValidationError('invalid_json', `Unable to parse JSON output: ${reason}`);
  }

  const result = codexOutputSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new OutputValidationError('invalid_json_schema', `JSON output does not match codex_output_schema: ${issues}`);
  }

  return result.data;
}

export function validateDiff(rawOutput: string): void {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new OutputValidationError('empty_diff_output', 'Output is empty; expected unified diff content.');
  }

  ensureAscii(trimmed);

  const hasBeginPatch = BEGIN_PATCH_REGEX.test(trimmed);
  const hasGitHeader = GIT_DIFF_HEADER_REGEX.test(trimmed);

  if (!hasBeginPatch && !hasGitHeader) {
    throw new OutputValidationError(
      'diff_missing_header',
      'Diff output must start with "*** Begin Patch" or "diff --git".'
    );
  }

  if (hasBeginPatch) {
    if (!END_PATCH_REGEX.test(trimmed)) {
      throw new OutputValidationError('diff_missing_end', 'Patch block is missing the "*** End Patch" terminator.');
    }
    if (!FILE_DIRECTIVE_REGEX.test(trimmed)) {
      throw new OutputValidationError(
        'diff_missing_file_directive',
        'Patch block must include at least one file directive (Add/Update/Delete).'
      );
    }
  }

  if (hasGitHeader && !HUNK_HEADER_REGEX.test(trimmed) && !FILE_HEADER_LINE_REGEX.test(trimmed)) {
    throw new OutputValidationError(
      'diff_missing_hunk',
      'Git-style diff must include at least one hunk header (e.g., "@@ -1 +1 @@").'
    );
  }

  const hasChangeLine = CHANGE_LINE_REGEX.test(trimmed);
  if (!hasChangeLine && !DELETE_DIRECTIVE_REGEX.test(trimmed)) {
    throw new OutputValidationError(
      'diff_missing_changes',
      'Diff output must contain at least one addition or deletion.'
    );
  }
}

export function detectOutputFormat(rawOutput: string): OutputFormat {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new OutputValidationError('empty_output', 'Model output is empty.');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    validateJSON(trimmed);
    return 'json';
  }

  validateDiff(trimmed);
  return 'diff';
}

/**
 * STRICT OUTPUT DSL SEMANTIC VALIDATION
 *
 * This layer enforces semantic constraints on the output DSL that go beyond
 * syntactic schema validation. It ensures:
 *
 * 1. Field-level constraints (non-empty arrays, string length limits)
 * 2. Cross-field consistency (notes should reference completed tasks)
 * 3. Structural invariants (array items are unique)
 * 4. Content boundaries (total output size reasonable)
 */

/**
 * Validates field presence and basic structure of CodexFinalSummary.
 * Throws OutputValidationError for missing or invalid required fields.
 */
export function validateCodexOutputFields(data: CodexFinalSummary): void {
  // completed_tasks: must be an array, can be empty
  if (!Array.isArray(data.completed_tasks)) {
    throw new OutputValidationError(
      'completed_tasks_not_array',
      'Field "completed_tasks" must be an array of strings.'
    );
  }

  // in_progress: must be an array, can be empty
  if (!Array.isArray(data.in_progress)) {
    throw new OutputValidationError(
      'in_progress_not_array',
      'Field "in_progress" must be an array of strings.'
    );
  }

  // blockers: must be an array, can be empty
  if (!Array.isArray(data.blockers)) {
    throw new OutputValidationError(
      'blockers_not_array',
      'Field "blockers" must be an array of strings.'
    );
  }

  // next_focus: should have at least one item for forward progress
  if (!Array.isArray(data.next_focus)) {
    throw new OutputValidationError(
      'next_focus_not_array',
      'Field "next_focus" must be an array of strings.'
    );
  }

  if (data.next_focus.length === 0) {
    throw new OutputValidationError(
      'next_focus_empty',
      'Field "next_focus" must contain at least one planned task for forward progress.',
      'error'
    );
  }

  // notes: must be a non-empty string
  if (typeof data.notes !== 'string') {
    throw new OutputValidationError(
      'notes_not_string',
      'Field "notes" must be a string.'
    );
  }

  if (data.notes.trim().length === 0) {
    throw new OutputValidationError(
      'notes_empty',
      'Field "notes" must contain meaningful context; empty notes indicate incomplete execution summary.'
    );
  }
}

/**
 * Validates array element uniqueness to prevent accidental duplication.
 * Returns list of duplicate items found.
 */
export function validateArrayUniqueness(
  data: CodexFinalSummary
): { duplicates: string[]; isUnique: boolean } {
  const findDuplicates = (arr: string[]): string[] => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const item of arr) {
      if (seen.has(item)) {
        dupes.add(item);
      }
      seen.add(item);
    }
    return Array.from(dupes);
  };

  const allDuplicates = [
    ...findDuplicates(data.completed_tasks),
    ...findDuplicates(data.in_progress),
    ...findDuplicates(data.blockers),
    ...findDuplicates(data.next_focus),
  ];

  return {
    duplicates: allDuplicates,
    isUnique: allDuplicates.length === 0,
  };
}

/**
 * Validates that task lists do not have redundant items (e.g., task in both completed and in_progress).
 * Returns conflicts found. Tracks unique lists, not duplicate occurrences within a single list.
 */
export function validateTaskListConsistency(
  data: CodexFinalSummary
): {
  conflicts: Array<{ task: string; inLists: string[] }>;
  isConsistent: boolean;
} {
  const taskMap = new Map<string, Set<string>>();

  for (const task of data.completed_tasks) {
    if (!taskMap.has(task)) taskMap.set(task, new Set());
    taskMap.get(task)!.add('completed_tasks');
  }

  for (const task of data.in_progress) {
    if (!taskMap.has(task)) taskMap.set(task, new Set());
    taskMap.get(task)!.add('in_progress');
  }

  for (const task of data.blockers) {
    if (!taskMap.has(task)) taskMap.set(task, new Set());
    taskMap.get(task)!.add('blockers');
  }

  for (const task of data.next_focus) {
    if (!taskMap.has(task)) taskMap.set(task, new Set());
    taskMap.get(task)!.add('next_focus');
  }

  const conflicts = Array.from(taskMap.entries())
    .filter(([, lists]) => lists.size > 1)
    .map(([task, listsSet]) => ({ task, inLists: Array.from(listsSet) }));

  return {
    conflicts,
    isConsistent: conflicts.length === 0,
  };
}

/**
 * Validates content boundaries: total output size, individual field limits.
 * Prevents abuse or accidental oversized outputs.
 */
export function validateContentBoundaries(data: CodexFinalSummary): {
  violations: Array<{ field: string; issue: string }>;
  withinBounds: boolean;
} {
  const violations: Array<{ field: string; issue: string }> = [];
  const MAX_NOTES_LENGTH = 5000; // reasonable limit for notes field
  const MAX_ITEMS_PER_ARRAY = 50; // prevent unreasonable array sizes

  if (data.notes.length > MAX_NOTES_LENGTH) {
    violations.push({
      field: 'notes',
      issue: `Notes exceeds ${MAX_NOTES_LENGTH} characters (length: ${data.notes.length})`,
    });
  }

  if (data.completed_tasks.length > MAX_ITEMS_PER_ARRAY) {
    violations.push({
      field: 'completed_tasks',
      issue: `Array exceeds ${MAX_ITEMS_PER_ARRAY} items (length: ${data.completed_tasks.length})`,
    });
  }

  if (data.in_progress.length > MAX_ITEMS_PER_ARRAY) {
    violations.push({
      field: 'in_progress',
      issue: `Array exceeds ${MAX_ITEMS_PER_ARRAY} items (length: ${data.in_progress.length})`,
    });
  }

  if (data.blockers.length > MAX_ITEMS_PER_ARRAY) {
    violations.push({
      field: 'blockers',
      issue: `Array exceeds ${MAX_ITEMS_PER_ARRAY} items (length: ${data.blockers.length})`,
    });
  }

  if (data.next_focus.length > MAX_ITEMS_PER_ARRAY) {
    violations.push({
      field: 'next_focus',
      issue: `Array exceeds ${MAX_ITEMS_PER_ARRAY} items (length: ${data.next_focus.length})`,
    });
  }

  return {
    violations,
    withinBounds: violations.length === 0,
  };
}

/**
 * Comprehensive semantic validation that runs all checks and collects violations.
 * This is the primary entry point for strict DSL validation.
 */
export function validateCodexOutputSemantics(data: CodexFinalSummary): SemanticValidationContext {
  const ctx = createSemanticValidationContext();

  try {
    validateCodexOutputFields(data);
  } catch (error) {
    if (error instanceof OutputValidationError) {
      ctx.errors.push({
        code: error.code,
        message: error.message,
        path: 'root',
        severity: error.severity,
      });
      ctx.isValid = false;
    }
  }

  // Validate uniqueness (warnings only)
  const uniqueness = validateArrayUniqueness(data);
  if (!uniqueness.isUnique) {
    ctx.warnings.push({
      code: 'duplicate_items_detected',
      message: `Duplicate items found: ${uniqueness.duplicates.join(', ')}`,
      path: 'arrays',
    });
  }

  // Validate consistency (errors)
  const consistency = validateTaskListConsistency(data);
  if (!consistency.isConsistent) {
    for (const conflict of consistency.conflicts) {
      ctx.errors.push({
        code: 'task_list_conflict',
        message: `Task "${conflict.task}" appears in multiple lists: ${conflict.inLists.join(', ')}`,
        path: 'root',
        severity: 'error',
      });
      ctx.isValid = false;
    }
  }

  // Validate boundaries (errors)
  const boundaries = validateContentBoundaries(data);
  if (!boundaries.withinBounds) {
    for (const violation of boundaries.violations) {
      ctx.errors.push({
        code: 'content_boundary_exceeded',
        message: `${violation.field}: ${violation.issue}`,
        path: violation.field,
        severity: 'error',
      });
      ctx.isValid = false;
    }
  }

  return ctx;
}

/**
 * Strict validation wrapper that combines syntactic and semantic validation.
 * Enforces the complete output DSL specification.
 *
 * @param rawOutput The raw model output
 * @param throwOnWarnings If true, treat warnings as errors
 * @returns Validated CodexFinalSummary
 * @throws OutputValidationError on validation failure
 */
export function strictValidateOutput(
  rawOutput: string,
  throwOnWarnings: boolean = false
): { data: CodexFinalSummary; semantics: SemanticValidationContext } {
  // First, syntactic validation
  const data = validateJSON(rawOutput);

  // Then, semantic validation
  const semantics = validateCodexOutputSemantics(data);

  // If there are errors, throw immediately
  if (!semantics.isValid) {
    const errorMessages = semantics.errors
      .map((e) => `[${e.code}] ${e.message}`)
      .join('; ');
    throw new OutputValidationError('semantic_validation_failed', errorMessages);
  }

  // If throwing on warnings and there are warnings, throw
  if (throwOnWarnings && semantics.warnings.length > 0) {
    const warningMessages = semantics.warnings
      .map((w) => `[${w.code}] ${w.message}`)
      .join('; ');
    throw new OutputValidationError('semantic_validation_warnings', warningMessages, 'warning');
  }

  return { data, semantics };
}
