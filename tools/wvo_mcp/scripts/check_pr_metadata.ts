import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CliOptions {
  workspaceRoot: string;
  taskId?: string;
  outputPath?: string;
}

interface MetadataReport {
  timestamp: string;
  status: 'passed' | 'failed';
  taskId?: string;
  whyNowPath: string;
  riskLabelPath: string;
  riskLabel?: string;
  issues: string[];
}

const DEFAULT_OUTPUT = (taskId?: string) =>
  taskId ? `state/evidence/${taskId}/verify/pr_metadata_report.json` : 'state/automation/pr_metadata_report.json';

const VALID_LABELS = new Set(['low', 'medium', 'high', 'critical']);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workspaceRoot: process.cwd(),
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === '--workspace' && idx + 1 < argv.length) {
      options.workspaceRoot = path.resolve(argv[++idx]);
    } else if (arg.startsWith('--workspace=')) {
      options.workspaceRoot = path.resolve(arg.split('=')[1] ?? '');
    } else if (arg === '--task' && idx + 1 < argv.length) {
      options.taskId = argv[++idx];
    } else if (arg.startsWith('--task=')) {
      options.taskId = arg.split('=')[1];
    } else if (arg === '--output' && idx + 1 < argv.length) {
      options.outputPath = argv[++idx];
    } else if (arg.startsWith('--output=')) {
      options.outputPath = arg.split('=')[1];
    } else if (arg === '--help') {
      console.log(`Usage: node tools/wvo_mcp/scripts/check_pr_metadata.ts [options]

Options:
  --workspace <path>   Workspace root (default: cwd)
  --task <TASK-ID>     Task identifier (locates pr metadata in state/evidence/<TASK-ID>/pr)
  --output <path>      Overridden report path
`);
      process.exit(0);
    }
  }

  return options;
}

async function readText(workspaceRoot: string, relativePath: string): Promise<string> {
  const absolute = path.join(workspaceRoot, relativePath);
  return fs.readFile(absolute, 'utf-8');
}

async function fileExists(workspaceRoot: string, relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(workspaceRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function evaluateMetadata(options: CliOptions): Promise<MetadataReport> {
  const whyNowPath = options.taskId
    ? `state/evidence/${options.taskId}/pr/why_now.txt`
    : 'state/automation/pr/why_now.txt';
  const riskLabelPath = options.taskId
    ? `state/evidence/${options.taskId}/pr/pr_risk_label.txt`
    : 'state/automation/pr/pr_risk_label.txt';

  const issues: string[] = [];
  let riskLabel: string | undefined;

  if (!(await fileExists(options.workspaceRoot, whyNowPath))) {
    issues.push(`Missing why-now file: ${whyNowPath}`);
  } else {
    const text = (await readText(options.workspaceRoot, whyNowPath)).trim();
    if (text.length === 0) {
      issues.push('why_now.txt is empty');
    }
  }

  if (!(await fileExists(options.workspaceRoot, riskLabelPath))) {
    issues.push(`Missing risk label file: ${riskLabelPath}`);
  } else {
    const labelText = (await readText(options.workspaceRoot, riskLabelPath)).trim().toLowerCase();
    if (!VALID_LABELS.has(labelText)) {
      issues.push(`Invalid risk label: ${labelText}`);
    } else {
      riskLabel = labelText;
    }
  }

  const status: 'passed' | 'failed' = issues.length === 0 ? 'passed' : 'failed';
  return {
    timestamp: new Date().toISOString(),
    status,
    taskId: options.taskId,
    whyNowPath,
    riskLabelPath,
    riskLabel,
    issues,
  };
}

async function writeReport(report: MetadataReport, workspaceRoot: string, outputPath?: string) {
  const defaultPath = DEFAULT_OUTPUT(report.taskId);
  const target = path.join(workspaceRoot, outputPath ?? defaultPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(report, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await evaluateMetadata(options);
  await writeReport(report, options.workspaceRoot, options.outputPath);

  if (report.status === 'failed') {
    console.error('PR metadata validation failed:');
    report.issues.forEach((issue) => console.error(`- ${issue}`));
    process.exitCode = 1;
  } else {
    console.log('PR metadata validation passed');
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (modulePath === path.resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error('PR metadata check failed with error:', error);
    process.exitCode = 1;
  });
}
