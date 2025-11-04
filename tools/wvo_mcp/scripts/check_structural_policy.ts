import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface StructuralPolicyOptions {
  workspaceRoot: string;
  changedFiles?: string[];
  allowlistPath?: string;
  outputPath?: string;
}

interface StructuralPolicyReport {
  timestamp: string;
  status: 'passed' | 'failed';
  summary: {
    checkedFiles: number;
    violations: number;
    allowlisted: number;
  };
  violations: Array<{
    file: string;
    reason: string;
    suggestions?: string[];
  }>;
  info?: Record<string, unknown>;
}

interface CliOptions extends StructuralPolicyOptions {
  baseRef?: string;
  changedArgs: string[];
  taskId?: string;
}

const DEFAULT_ALLOWLIST = 'tools/wvo_mcp/config/structural_policy_allowlist.json';

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workspaceRoot: process.cwd(),
    allowlistPath: undefined,
    outputPath: undefined,
    changedArgs: [],
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === '--workspace' && idx + 1 < argv.length) {
      options.workspaceRoot = path.resolve(argv[++idx]);
    } else if (arg.startsWith('--workspace=')) {
      options.workspaceRoot = path.resolve(arg.split('=')[1] ?? '');
    } else if (arg === '--allowlist' && idx + 1 < argv.length) {
      options.allowlistPath = argv[++idx];
    } else if (arg.startsWith('--allowlist=')) {
      options.allowlistPath = arg.split('=')[1];
    } else if (arg === '--output' && idx + 1 < argv.length) {
      options.outputPath = argv[++idx];
    } else if (arg.startsWith('--output=')) {
      options.outputPath = arg.split('=')[1];
    } else if (arg === '--base-ref' && idx + 1 < argv.length) {
      options.baseRef = argv[++idx];
    } else if (arg.startsWith('--base-ref=')) {
      options.baseRef = arg.split('=')[1];
    } else if (arg === '--changed' && idx + 1 < argv.length) {
      options.changedArgs.push(argv[++idx]);
    } else if (arg.startsWith('--changed=')) {
      options.changedArgs.push(arg.split('=')[1] ?? '');
    } else if (arg === '--task' && idx + 1 < argv.length) {
      options.taskId = argv[++idx];
    } else if (arg.startsWith('--task=')) {
      options.taskId = arg.split('=')[1];
    } else if (arg === '--help') {
      console.log(`Usage: node tools/wvo_mcp/scripts/check_structural_policy.ts [options]

Options:
  --workspace <path>     Workspace root (default: cwd)
  --allowlist <path>     Allowlist JSON (default: tools/wvo_mcp/config/structural_policy_allowlist.json)
  --output <path>        Where to write report JSON (default: state/automation/structural_policy_report.json)
  --base-ref <ref>       Git base reference for diff (e.g., origin/main)
  --changed <path>       Explicit changed file (repeatable; overrides git diff)
  --task <TASK-ID>       Task identifier for metadata
`);
      process.exit(0);
    }
  }

  return options;
}

async function loadAllowlist(workspaceRoot: string, allowlistPath?: string): Promise<Set<string>> {
  const result = new Set<string>();
  const candidate = allowlistPath ?? path.join(workspaceRoot, DEFAULT_ALLOWLIST);
  try {
    const raw = await fs.readFile(candidate, 'utf-8');
    const parsed = JSON.parse(raw) as { paths?: string[] };
    for (const entry of parsed.paths ?? []) {
      result.add(path.normalize(entry));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  return result;
}

function gitDiff(workspaceRoot: string, baseRef?: string): string[] {
  const args = baseRef
    ? ['diff', '--name-only', `${baseRef}...HEAD`]
    : ['diff', '--name-only', 'HEAD'];
  const output = execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf-8' });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isSourceFile(filePath: string): boolean {
  if (!filePath.startsWith('tools/wvo_mcp/src/')) return false;
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return false;
  if (filePath.includes('__tests__')) return false;
  if (filePath.includes('/__mocks__/')) return false;
  if (filePath.includes('.test.')) return false;
  return true;
}

function isTestFile(filePath: string): boolean {
  return filePath.includes('.test.') || filePath.includes('__tests__');
}

function normalizeSourceRoot(sourcePath: string): string {
  const withNoExt = sourcePath.replace(/\.(ts|tsx)$/, '');
  return path.normalize(withNoExt);
}

function normalizeTestRoot(testPath: string): string {
  let normalized = testPath;
  normalized = normalized.replace(/\.(test|spec)\.(ts|tsx)$/, '');
  normalized = normalized.replace(/__tests__\//, '');
  return path.normalize(normalized);
}

async function fileExists(workspaceRoot: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(workspaceRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function gatherCandidateTests(workspaceRoot: string, sourceFile: string): Promise<string[]> {
  const dir = path.dirname(sourceFile);
  const base = path.basename(sourceFile).replace(/\.(ts|tsx)$/, '');
  const extensions = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
  const candidates: string[] = [];

  for (const ext of extensions) {
    candidates.push(path.join(dir, `${base}${ext}`));
    candidates.push(path.join(dir, '__tests__', `${base}${ext}`));
  }

  // Additional candidate: replace `/src/` with `/src/__tests__/` root
  const srcPrefix = 'tools/wvo_mcp/src/';
  if (sourceFile.startsWith(srcPrefix)) {
    const relative = sourceFile.slice(srcPrefix.length);
    const testDir = path.join(srcPrefix, '__tests__');
    for (const ext of extensions) {
      candidates.push(path.join(testDir, `${relative.replace(/\/(?!.*\/).*/, '')}${ext}`));
    }
  }

  const existing: string[] = [];
  for (const candidate of candidates) {
    if (await fileExists(workspaceRoot, candidate)) {
      existing.push(candidate);
    }
  }
  return Array.from(new Set(existing));
}

function deriveChangedFiles(options: StructuralPolicyOptions, cliOptions: CliOptions): string[] {
  if (cliOptions.changedArgs.length > 0) {
    return cliOptions.changedArgs.map((arg) => path.normalize(arg)).filter(Boolean);
  }
  return gitDiff(options.workspaceRoot, cliOptions.baseRef).map((file) => path.normalize(file));
}

export async function evaluateStructuralPolicy(options: StructuralPolicyOptions, cliOptions?: CliOptions): Promise<StructuralPolicyReport> {
  const changed = cliOptions ? deriveChangedFiles(options, cliOptions) : options.changedFiles ?? [];
  const allowlist = await loadAllowlist(options.workspaceRoot, options.allowlistPath);
  const changedTests = new Set(
    changed.filter(isTestFile).map((file) => normalizeTestRoot(file)),
  );

  const targetFiles = changed.filter(isSourceFile);
  const violations: StructuralPolicyReport['violations'] = [];
  let allowlistedCount = 0;

  for (const sourceFile of targetFiles) {
    if (allowlist.has(path.normalize(sourceFile))) {
      allowlistedCount += 1;
      continue;
    }

    const normalizedSource = normalizeSourceRoot(sourceFile);
    const hasChangedTest = changedTests.has(normalizedSource);
    const existingTests = await gatherCandidateTests(options.workspaceRoot, sourceFile);

    if (!hasChangedTest && existingTests.length === 0) {
      violations.push({
        file: sourceFile,
        reason: 'No companion test detected',
        suggestions: [
          'Add or update a test file alongside the source (e.g., foo.test.ts).',
          'If intentionally untested, add to structural policy allowlist with justification.',
        ],
      });
    }
  }

  const status: 'passed' | 'failed' = violations.length === 0 ? 'passed' : 'failed';

  return {
    timestamp: new Date().toISOString(),
    status,
    summary: {
      checkedFiles: targetFiles.length,
      violations: violations.length,
      allowlisted: allowlistedCount,
    },
    violations,
  };
}

async function writeReport(report: StructuralPolicyReport, workspaceRoot: string, outputPath?: string) {
  const target = outputPath ?? path.join(workspaceRoot, 'state', 'automation', 'structural_policy_report.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(report, null, 2));
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));
  const report = await evaluateStructuralPolicy(
    {
      workspaceRoot: cliOptions.workspaceRoot,
      allowlistPath: cliOptions.allowlistPath,
      changedFiles: cliOptions.changedArgs,
      outputPath: cliOptions.outputPath,
    },
    cliOptions,
  );

  await writeReport(report, cliOptions.workspaceRoot, cliOptions.outputPath);

  if (report.status === 'failed') {
    console.error('Structural policy violations detected');
    report.violations.forEach((violation) => {
      console.error(`- ${violation.file}: ${violation.reason}`);
    });
    process.exitCode = 1;
  } else {
    console.log('Structural policy check passed');
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (modulePath === path.resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error('Structural policy check failed with error:', error);
    process.exitCode = 1;
  });
}
