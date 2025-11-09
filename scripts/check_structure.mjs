#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const STRUCTURE_TARGETS = [
  "tools/wvo_mcp/src",
  "tools/wvo_mcp/scripts",
  "tools/wvo_mcp/tests",
  "tools/autopilot/scripts",
  "docs/templates",
  "state/logs",
  "state/evidence",
];

function summarizeDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const subdirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return { exists: true, files, subdirs };
  } catch (error) {
    return { exists: false, error: String(error) };
  }
}

const report = {
  generated_at: new Date().toISOString(),
  project_root: PROJECT_ROOT,
  targets: {},
};

for (const relPath of STRUCTURE_TARGETS) {
  const abs = path.join(PROJECT_ROOT, relPath);
  report.targets[relPath] = summarizeDir(abs);
}

const outDir = path.join(PROJECT_ROOT, "state", "logs", "AFP-W0-STEP5-MUTATION", "structure");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Structure report written to ${outPath}`);
