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

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OutputValidationError';
    this.code = code;
  }
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
