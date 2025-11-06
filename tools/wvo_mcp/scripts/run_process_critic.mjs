#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TEST_FILE_PATTERNS = [
  /(^|\/)tests?\//i,
  /(^|\/)__tests__\//i,
  /\.test\.[jt]sx?$/i,
  /\.spec\.[jt]sx?$/i,
  /_test\.py$/i,
  /Test\.java$/i,
  /_test\.go$/i,
];

const DEFERRAL_KEYWORDS = ["defer", "deferred", "later", "future", "eventual", "todo", "tbd"];
const DOC_ONLY_KEYWORDS = ["docs-only", "documentation-only", "documentation only", "docs only"];

const AUTOPILOT_PATH_PATTERNS = [
  /autopilot/i,
  /wave0/i,
  /autopilot_mvp/i,
  /autopilot\/?/i,
  /supervisor/i,
  /tools\/wvo_mcp\/src\/wave0/i,
];

const AUTOPILOT_PLAN_KEYWORDS = [
  /autopilot/i,
  /wave\s?0/i,
  /wave0/i,
  /supervisor/i,
  /builder agent/i,
  /reviewer agent/i,
  /allocator/i,
];

const AUTOPILOT_TEST_KEYWORDS = [
  /wave\s?0/i,
  /run_wave0/i,
  /npm run wave0/i,
  /ps aux.*wave0/i,
  /live autopilot/i,
  /tools\/wvo_mcp\/scripts\/run_wave0/i,
  /tools\/taskflow/i,
  /taskflow/i,
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..");

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function isTestFile(filePath) {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function parseStagedFiles() {
  try {
    const output = execSync("git diff --name-status --cached", {
      cwd: WORKSPACE_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!output) {
      return [];
    }
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const status = parts[0];
        const stagedPath = parts[parts.length - 1];
        return { status, path: normalizePath(stagedPath) };
      });
  } catch {
    return [];
  }
}

function extractTestsSection(content) {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.toLowerCase().includes("plan-authored tests"));
  if (index === -1) {
    return null;
  }

  const section = [];
  const firstLine = lines[index];
  const remainder = firstLine.split(":").slice(1).join(":").trim();
  if (remainder.length > 0) {
    section.push(remainder);
  }

  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      continue;
    }
    if (/^##\s/.test(line)) {
      break;
    }
    if (/^\s{2,}-\s+/.test(line) || /^\s{2,}/.test(line)) {
      section.push(line.trim());
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      section.push(line.trim());
      continue;
    }
    if (section.length === 0) {
      break;
    }
    section.push(line.trim());
  }

  const joined = section.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

function listPlanDocuments() {
  const evidenceRoot = path.join(WORKSPACE_ROOT, "state", "evidence");
  const docs = [];

  if (!fs.existsSync(evidenceRoot)) {
    return docs;
  }

  const tasks = fs.readdirSync(evidenceRoot, { withFileTypes: true });
  for (const entry of tasks) {
    if (!entry.isDirectory()) {
      continue;
    }
    const planPath = path.join("state", "evidence", entry.name, "plan.md");
    const absolute = path.join(WORKSPACE_ROOT, planPath);
    if (fs.existsSync(absolute)) {
      docs.push({
        path: normalizePath(planPath),
        content: fs.readFileSync(absolute, "utf8"),
      });
    }
  }

  return docs;
}

function planMentionsTestPath(planDocs, testPath) {
  const normalizedTestPath = normalizePath(testPath);
  return planDocs.some((doc) =>
    doc.content.includes(normalizedTestPath) ||
    doc.content.includes(normalizedTestPath.replace(/\.[^/.]+$/, "")),
  );
}

function isAutopilotPlan(content) {
  const normalized = content.toLowerCase();
  return AUTOPILOT_PLAN_KEYWORDS.some((pattern) => pattern.test(normalized));
}

function requiresDocsOnlyBypass(content) {
  const normalized = content.toLowerCase();
  return DOC_ONLY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function inspectPlan(planPath, content) {
  const issues = [];
  const testsSection = extractTestsSection(content);
  if (!testsSection) {
    issues.push({
      code: "missing_tests_section",
      message: `${planPath} is missing a 'PLAN-authored tests' entry.`,
      guidance:
        "Update the Implementation Plan scope to include 'PLAN-authored tests' with the tests you created before IMPLEMENT.",
    });
    return issues;
  }

  const normalized = testsSection.replace(/\s+/g, " ").toLowerCase();
  const rawLines = testsSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (DEFERRAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    issues.push({
      code: "tests_deferred",
      message: `${planPath} defers PLAN-authored tests.`,
      guidance: "Tests must be authored during PLAN. Replace deferrals with failing/skipped tests.",
      tests_section: testsSection.trim(),
    });
  }

  if (/[\[].*?\]/.test(testsSection) || normalized.includes("list the tests") || normalized.includes("placeholder")) {
    issues.push({
      code: "tests_placeholder",
      message: `${planPath} still contains placeholder text in the tests section.`,
      guidance: "Replace template placeholders with the concrete test names or commands.",
      tests_section: testsSection.trim(),
    });
  }

  const marksNotApplicable = normalized.includes("n/a") || normalized.includes("not applicable");
  if (marksNotApplicable) {
    const docOnlyMentioned = DOC_ONLY_KEYWORDS.some(
      (keyword) => normalized.includes(keyword) || content.toLowerCase().includes(keyword),
    );
    if (!docOnlyMentioned) {
      issues.push({
        code: "tests_marked_na_without_doc_only",
        message: `${planPath} marks tests as N/A without stating this work is docs-only.`,
        guidance: "If no tests apply, explicitly state that the task is docs-only or provide a justification.",
      });
    }
  } else {
    const hasMeaningfulEntry = rawLines.some((line) => line.toLowerCase() !== "plan-authored tests:");
    const hasTestKeyword = /test|pytest|unit|integration|manual/.test(normalized);
    if (!hasMeaningfulEntry || !hasTestKeyword) {
      issues.push({
        code: "tests_not_concrete",
        message: `${planPath} does not list concrete PLAN-authored tests.`,
        guidance: "List each test you authored (for example: tests/path/test_file.py::test_case, Manual smoke: Wave0 autopilot).",
        tests_section: testsSection.trim(),
      });
    }
  }

  if (isAutopilotPlan(content) && !requiresDocsOnlyBypass(content)) {
    const hasLiveKeyword = AUTOPILOT_TEST_KEYWORDS.some((pattern) => pattern.test(normalized));
    if (!hasLiveKeyword) {
      issues.push({
        code: "autopilot_live_tests_missing",
        message: `${planPath} references autopilot work but does not list a Wave 0 live test.`,
        guidance: "Add a PLAN-authored test describing the live Wave 0 loop (e.g., `npm run wave0`, `ps aux | grep wave0`, `TaskFlow Wave 0 live smoke`).",
        tests_section: testsSection.trim(),
      });
    }
  }

  return issues;
}

function runProcessGuard() {
  const stagedFiles = parseStagedFiles();
  if (stagedFiles.length === 0) {
    return { passed: true, stdout: "No staged changes detected; ProcessCritic skipped." };
  }

  const issues = [];
  const planFiles = stagedFiles.filter(
    (file) => file.path.startsWith("state/evidence/") && file.path.endsWith("/plan.md"),
  );

  for (const planFile of planFiles) {
    const absolutePath = path.join(WORKSPACE_ROOT, planFile.path);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const content = fs.readFileSync(absolutePath, "utf8");
    issues.push(...inspectPlan(planFile.path, content));
  }

  const newTestFiles = stagedFiles.filter(
    (file) => file.status.startsWith("A") && isTestFile(file.path),
  );

  if (newTestFiles.length > 0) {
    const planDocs = listPlanDocuments();
    const hasPlanUpdate = planFiles.length > 0;
    for (const testFile of newTestFiles) {
      if (hasPlanUpdate) {
        continue;
      }
      if (!planMentionsTestPath(planDocs, testFile.path)) {
        issues.push({
          code: "tests_without_plan",
          message: `New test file ${testFile.path} is staged without a PLAN update referencing it.`,
          guidance: "Author tests during PLAN and stage the updated plan.md before adding new test files.",
        });
      }
    }
  }

  const autopilotCodeTouched = stagedFiles.some((file) =>
    AUTOPILOT_PATH_PATTERNS.some((pattern) => pattern.test(file.path)),
  );

  if (autopilotCodeTouched && planFiles.length === 0) {
    issues.push({
      code: "autopilot_plan_missing",
      message: "Autopilot changes detected but no plan.md updates are staged. Autopilot work must document live Wave 0 testing in PLAN before implementation.",
      guidance: "Stage the relevant plan.md update listing Wave 0 live testing steps before committing autopilot code changes.",
    });
  }

  if (issues.length > 0) {
    const details = issues.map((issue, idx) => `${idx + 1}. [${issue.code}] ${issue.message}\n   -> ${issue.guidance || "Follow PLAN policy"}`).join("\n");
    return {
      passed: false,
      stderr: `ProcessCritic detected ${issues.length} issue(s):\n${details}`,
      code: 1,
    };
  }

  const inspectedPlans = planFiles.map((file) => file.path);
  const summary = inspectedPlans.length
    ? `ProcessCritic checks passed (plans inspected: ${inspectedPlans.join(", ")}).`
    : "ProcessCritic checks passed (no plans staged).";
  return { passed: true, stdout: summary };
}

function main() {
  const result = runProcessGuard();
  if (result.passed) {
    if (result.stdout) {
      console.log(result.stdout);
    }
    return;
  }

  console.error(result.stderr || "ProcessCritic detected issues.");
  process.exit(result.code ?? 1);
}

main();
