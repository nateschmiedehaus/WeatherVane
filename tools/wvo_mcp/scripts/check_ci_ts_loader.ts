#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type CliOptions = {
  workflowPath: string;
};

export type Violation = {
  line: number;
  stepName?: string;
  command: string;
  reason: string;
};

const DEFAULT_WORKFLOW = ".github/workflows/ci.yml";
const ALLOWED_PATTERNS = [
  /--import\s+tsx/,
  /\btsx\b/,
  /--loader\s+ts-node/,
  /--loader\s+tsx/,
];

export function parseArgs(argv: string[]): CliOptions {
  let workflowPath = DEFAULT_WORKFLOW;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workflow" || arg === "-w") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --workflow");
      }
      workflowPath = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { workflowPath };
}

function printHelp() {
  console.log(`check_ci_ts_loader.ts

Ensures that CI workflow TypeScript scripts run with a loader capable of parsing TypeScript under Node 20.

Usage:
  node --import tsx tools/wvo_mcp/scripts/check_ci_ts_loader.ts [--workflow <path>]

Options:
  --workflow, -w   Path to the workflow file to inspect (default: ${DEFAULT_WORKFLOW})
  --help, -h       Show this message
`);
}

function normaliseWorkflowPath(workflowPath: string): string {
  if (path.isAbsolute(workflowPath)) {
    return workflowPath;
  }
  return path.resolve(process.cwd(), workflowPath);
}

function extractStepName(lines: string[], startIndex: number): string | undefined {
  for (let i = startIndex; i >= 0; i -= 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- name:")) {
      return trimmed.slice("- name:".length).trim();
    }
    if (trimmed.startsWith("name:")) {
      return trimmed.slice("name:".length).trim();
    }
    if (trimmed.startsWith("- uses:") || trimmed.startsWith("- run:")) {
      // hit the beginning of another step without a name
      break;
    }
  }
  return undefined;
}

function gatherCommand(
  lines: string[],
  startIndex: number,
): { command: string; endIndex: number } {
  const line = lines[startIndex];
  const indentation = line.match(/^(\s*)/)?.[1] ?? "";
  const trimmed = line.trim();

  if (/^run:\s*[|>]/.test(trimmed)) {
    const blockIndent = indentation.length + 2;
    let command = "";
    let cursor = startIndex + 1;

    while (cursor < lines.length) {
      const candidate = lines[cursor];
      const candidateIndent = candidate.match(/^(\s*)/)?.[1] ?? "";
      if (candidateIndent.length < blockIndent || candidate.trim().startsWith("- ")) {
        break;
      }
      command += `${candidate.slice(blockIndent)}\n`;
      cursor += 1;
    }

    return { command: command.trimEnd(), endIndex: cursor - 1 };
  }

  const inline = trimmed.replace(/^run:\s*/, "");
  return { command: inline, endIndex: startIndex };
}

function hasAllowedLoader(command: string): boolean {
  return ALLOWED_PATTERNS.some((pattern) => pattern.test(command));
}

export function analyseWorkflow(content: string): Violation[] {
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const trimmed = lines[lineIndex].trim();
    if (!trimmed.startsWith("run:")) {
      continue;
    }

    const { command, endIndex } = gatherCommand(lines, lineIndex);
    const containsTsTarget = /\.ts(?:\s|$|["'\\])/m.test(command);

    if (!containsTsTarget) {
      lineIndex = endIndex;
      continue;
    }

    const lowerCommand = command.toLowerCase();
    const invokesNode = /\bnode\b/.test(lowerCommand);
    const invokesTsxBinary = /\btsx\b/.test(lowerCommand);

    const loaderOk =
      (invokesNode && hasAllowedLoader(lowerCommand)) || (!invokesNode && invokesTsxBinary);

    if (!loaderOk) {
      violations.push({
        line: lineIndex + 1,
        stepName: extractStepName(lines, lineIndex - 1),
        command,
        reason:
          "TypeScript scripts must execute with tsx (or equivalent loader) to run under Node 20.",
      });
    }

    lineIndex = endIndex;
  }

  return violations;
}

export async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const workflowPath = normaliseWorkflowPath(options.workflowPath);

    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow file not found: ${workflowPath}`);
    }

    const content = fs.readFileSync(workflowPath, "utf8");
    const violations = analyseWorkflow(content);

    if (violations.length > 0) {
      console.error(
        `CI TypeScript loader enforcement failed (${violations.length} violation${
          violations.length === 1 ? "" : "s"
        }):`,
      );
      for (const violation of violations) {
        const step = violation.stepName ? `Step "${violation.stepName}"` : "Unnamed step";
        console.error(
          `  - ${step} (line ${violation.line}): ${violation.reason}\n    Command: ${violation.command}`,
        );
      }
      process.exit(1);
    }

    console.log("CI TypeScript loader enforcement passed");
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown error", error);
    }
    process.exit(1);
  }
}

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  const resolvedEntry = path.resolve(entry);
  return import.meta.url === pathToFileURL(resolvedEntry).href;
})();

if (isDirectExecution) {
  void main();
}
