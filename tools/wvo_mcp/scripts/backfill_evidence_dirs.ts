#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import YAML from "yaml";

type CliOptions = {
  roadmapPath: string;
  workspaceRoot: string;
  dryRun: boolean;
  outputPath: string;
};

type WorkProcessPhase =
  | "strategize"
  | "spec"
  | "plan"
  | "think"
  | "implement"
  | "verify"
  | "review"
  | "pr"
  | "monitor";

const DEFAULT_PHASES: WorkProcessPhase[] = [
  "strategize",
  "spec",
  "plan",
  "think",
  "implement",
  "verify",
  "review",
  "pr",
  "monitor",
];

interface RoadmapTask {
  id: string;
  evidence_path?: string;
  work_process_phases?: WorkProcessPhase[];
}

interface RoadmapMilestone {
  id: string;
  tasks?: RoadmapTask[];
}

interface RoadmapEpic {
  id: string;
  milestones?: RoadmapMilestone[];
}

interface RoadmapFile {
  epics: RoadmapEpic[];
}

interface PhaseResult {
  taskId: string;
  phase: WorkProcessPhase;
  evidencePath: string;
  created: boolean;
  placeholderCreated: boolean;
}

interface BackfillReport {
  timestamp: string;
  workspaceRoot: string;
  roadmapPath: string;
  dryRun: boolean;
  summary: {
    tasksVisited: number;
    directoriesChecked: number;
    directoriesCreated: number;
    placeholdersCreated: number;
  };
  details: PhaseResult[];
}

function parseArgs(argv: string[]): CliOptions {
  let roadmapPath = "state/roadmap.yaml";
  let workspaceRoot = process.cwd();
  let dryRun = false;
  let outputPath = "state/automation/evidence_backfill_report.json";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--roadmap":
      case "-r": {
        const next = argv[i + 1];
        if (!next) throw new Error("Missing value for --roadmap");
        roadmapPath = next;
        i += 1;
        break;
      }
      case "--workspace":
      case "--workspace-root":
      case "-w": {
        const next = argv[i + 1];
        if (!next) throw new Error("Missing value for --workspace-root");
        workspaceRoot = next;
        i += 1;
        break;
      }
      case "--output":
      case "-o": {
        const next = argv[i + 1];
        if (!next) throw new Error("Missing value for --output");
        outputPath = next;
        i += 1;
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    roadmapPath,
    workspaceRoot: path.resolve(workspaceRoot),
    dryRun,
    outputPath,
  };
}

function printHelp(): void {
  console.log(`backfill_evidence_dirs.ts

Ensures evidence directories exist for every roadmap task/phase combination.

Usage:
  node --import tsx tools/wvo_mcp/scripts/backfill_evidence_dirs.ts [options]

Options:
  --roadmap, -r <path>        Path to roadmap.yaml (default: state/roadmap.yaml)
  --workspace, -w <path>      Workspace root (default: cwd)
  --output, -o <path>         Path for JSON report (default: state/automation/evidence_backfill_report.json)
  --dry-run                   Report missing directories without creating them
  --help, -h                  Show this message
`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(
  dirPath: string,
  dryRun: boolean,
): Promise<{ created: boolean; placeholderCreated: boolean }> {
  const alreadyExists = await fileExists(dirPath);
  if (alreadyExists) {
    return { created: false, placeholderCreated: false };
  }

  if (dryRun) {
    return { created: false, placeholderCreated: false };
  }

  await fs.mkdir(dirPath, { recursive: true });

  const placeholderPath = path.join(dirPath, "README.md");
  const placeholderExists = await fileExists(placeholderPath);
  if (!placeholderExists) {
    const iso = new Date().toISOString();
    const content = `# Evidence Placeholder

This directory was generated automatically by \`backfill_evidence_dirs.ts\` on ${iso}.

The associated task predates enforced STRATEGIZE→MONITOR evidence requirements. Replace this
placeholder with actual artifacts the next time work occurs on this task.
`;
    await fs.writeFile(placeholderPath, content, "utf8");
    return { created: true, placeholderCreated: true };
  }

  return { created: true, placeholderCreated: false };
}

async function readRoadmap(roadmapFile: string): Promise<RoadmapFile> {
  const content = await fs.readFile(roadmapFile, "utf8");
  return YAML.parse(content) as RoadmapFile;
}

function collectTasks(roadmap: RoadmapFile): RoadmapTask[] {
  const tasks: RoadmapTask[] = [];
  for (const epic of roadmap.epics ?? []) {
    for (const milestone of epic.milestones ?? []) {
      for (const task of milestone.tasks ?? []) {
        tasks.push(task);
      }
    }
  }
  return tasks;
}

async function backfill(options: CliOptions): Promise<BackfillReport> {
  const roadmapAbs = path.isAbsolute(options.roadmapPath)
    ? options.roadmapPath
    : path.join(options.workspaceRoot, options.roadmapPath);
  const roadmap = await readRoadmap(roadmapAbs);
  const tasks = collectTasks(roadmap);
  const results: PhaseResult[] = [];

  let directoriesChecked = 0;
  let directoriesCreated = 0;
  let placeholdersCreated = 0;

  for (const task of tasks) {
    if (!task.evidence_path) continue;
    const phases = (task.work_process_phases ?? DEFAULT_PHASES) as WorkProcessPhase[];

    for (const phase of phases) {
      directoriesChecked += 1;
      const evidenceDir = path.join(options.workspaceRoot, task.evidence_path, phase);
      const ensured = await ensureDirectory(evidenceDir, options.dryRun);

      if (ensured.created) directoriesCreated += 1;
      if (ensured.placeholderCreated) placeholdersCreated += 1;

      if (!ensured.created && options.dryRun) {
        const exists = await fileExists(evidenceDir);
        if (exists) continue;
      }

      results.push({
        taskId: task.id,
        phase,
        evidencePath: evidenceDir,
        created: ensured.created,
        placeholderCreated: ensured.placeholderCreated,
      });
    }
  }

  const report: BackfillReport = {
    timestamp: new Date().toISOString(),
    workspaceRoot: options.workspaceRoot,
    roadmapPath: roadmapAbs,
    dryRun: options.dryRun,
    summary: {
      tasksVisited: tasks.length,
      directoriesChecked,
      directoriesCreated,
      placeholdersCreated,
    },
    details: results,
  };

  if (!options.dryRun) {
    const outputAbs = path.isAbsolute(options.outputPath)
      ? options.outputPath
      : path.join(options.workspaceRoot, options.outputPath);
    await fs.mkdir(path.dirname(outputAbs), { recursive: true });
    await fs.writeFile(outputAbs, JSON.stringify(report, null, 2), "utf8");
  }

  return report;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await backfill(options);

    console.log(
      `Backfill completed: checked ${report.summary.directoriesChecked} directories, ` +
        `created ${report.summary.directoriesCreated}, placeholders ${report.summary.placeholdersCreated}.`,
    );

    if (options.dryRun) {
      console.log("Dry run: no filesystem changes were made.");
    } else {
      console.log(`Report written to ${options.outputPath}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown error", error);
    }
    process.exit(1);
  }
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
})();

if (invokedDirectly) {
  void main();
}
