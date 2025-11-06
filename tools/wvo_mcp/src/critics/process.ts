import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { Critic, type CriticResult } from "./base.js";

type StagedFile = {
  status: string;
  path: string;
};

type ProcessIssue = {
  code: string;
  message: string;
  file?: string;
  details?: Record<string, unknown>;
};

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

const DAILY_AUDIT_DIR_REGEX = /^AFP-ARTIFACT-AUDIT-(\d{4})(\d{2})(\d{2})$/;
const DAILY_AUDIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OVERRIDE_LEDGER_PATH = ["state", "overrides.jsonl"];

function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function parseStagedFiles(workspaceRoot: string): StagedFile[] {
  try {
    const output = execSync("git diff --name-status --cached", {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();

    if (!output) {
      return [];
    }

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split("\t");
        const status = parts[0];
        const pathPart = parts[parts.length - 1];
        return {
          status,
          path: normalizePath(pathPart),
        };
      });
  } catch {
    return [];
  }
}

export class ProcessCritic extends Critic {
  private cachedPlanDocs?: Array<{ path: string; content: string }>;

  protected command(): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const stagedFiles = parseStagedFiles(this.workspaceRoot);
    if (stagedFiles.length === 0) {
      return this.pass("No staged changes detected; process guardrails already satisfied.");
    }

    const issues: ProcessIssue[] = [];
    const planFiles = stagedFiles.filter((file) =>
      file.path.startsWith("state/evidence/") && file.path.endsWith("/plan.md"),
    );
    const now = new Date();

    for (const planFile of planFiles) {
      const absolutePath = path.join(this.workspaceRoot, planFile.path);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }
      const content = fs.readFileSync(absolutePath, "utf8");
      issues.push(...this.inspectPlanDocument(planFile.path, content));
    }

    const newTestFiles = stagedFiles.filter(
      (file) => file.status.startsWith("A") && isTestFile(file.path),
    );

    if (newTestFiles.length > 0) {
      const hasPlanUpdate = planFiles.length > 0;
      for (const testFile of newTestFiles) {
        if (hasPlanUpdate) {
          continue;
        }
        if (!this.planMentionsTestPath(testFile.path)) {
          issues.push({
            code: "tests_without_plan",
            message: `New test file ${testFile.path} is staged without a PLAN update referencing it.`,
            details: {
              guidance:
                "Author tests during PLAN and stage the updated plan.md before adding new test files.",
            },
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
        message:
          "Autopilot changes detected but no plan.md updates are staged. Autopilot work must document live Wave 0 testing in PLAN before implementation.",
        details: {
          guidance:
            "Stage the relevant plan.md update that lists Wave 0 live testing steps before committing autopilot code changes.",
        },
      });
    }

    this.enforceDailyAudit(now, issues);
    this.enforceOverrideLedgerFreshness(now, issues);

    if (issues.length > 0) {
      return this.fail("Process guardrails failed.", { issues });
    }

    return this.pass("Process guardrails satisfied.", {
      inspected_plans: planFiles.map((file) => file.path),
      new_tests_checked: newTestFiles.map((file) => file.path),
    });
  }

  private inspectPlanDocument(planPath: string, content: string): ProcessIssue[] {
    const issues: ProcessIssue[] = [];
    const testsSection = this.extractTestsSection(content);
    if (!testsSection) {
      issues.push({
        code: "missing_tests_section",
        message: `${planPath} is missing a 'PLAN-authored tests' entry.`,
        details: {
          guidance:
            "Update the Implementation Plan scope to include 'PLAN-authored tests' with the tests you created before IMPLEMENT.",
        },
      });
      return issues;
    }

    const normalized = testsSection.replace(/\s+/g, " ").toLowerCase();
    const rawLines = testsSection
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const containsDeferral = DEFERRAL_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    );
    if (containsDeferral) {
      issues.push({
        code: "tests_deferred",
        message: `${planPath} defers PLAN-authored tests.`,
        details: {
          tests_section: testsSection.trim(),
          guidance:
            "Tests must be authored during PLAN. Replace deferrals with the failing or skipped tests you added.",
        },
      });
    }

    const containsPlaceholder =
      /\[.*\]/.test(testsSection) ||
      normalized.includes("list the tests") ||
      normalized.includes("placeholder");

    if (containsPlaceholder) {
      issues.push({
        code: "tests_placeholder",
        message: `${planPath} still contains placeholder text in the tests section.`,
        details: {
          tests_section: testsSection.trim(),
          guidance: "Replace template placeholders with the concrete test names or commands.",
        },
      });
    }

    const marksNotApplicable =
      normalized.includes("n/a") || normalized.includes("not applicable");

    if (marksNotApplicable) {
      const docOnlyMentioned = DOC_ONLY_KEYWORDS.some((keyword) =>
        normalized.includes(keyword) || content.toLowerCase().includes(keyword),
      );
      if (!docOnlyMentioned) {
        issues.push({
          code: "tests_marked_na_without_doc_only",
          message: `${planPath} marks tests as N/A without stating this work is docs-only.`,
          details: {
            guidance:
              "If no tests apply, explicitly state that the task is docs-only or provide a justification.",
          },
        });
      }
    } else {
      const hasMeaningfulEntry = rawLines.some((line) => line.toLowerCase() !== "plan-authored tests:");
      const hasTestKeyword = /test|pytest|unit|integration|manual/.test(normalized);
      if (!hasMeaningfulEntry || !hasTestKeyword) {
        issues.push({
          code: "tests_not_concrete",
          message: `${planPath} does not list concrete PLAN-authored tests.`,
          details: {
            tests_section: testsSection.trim(),
            guidance:
              "List each test you authored (e.g., `tests/path/test_file.py::test_case`, `Manual smoke: ...`).",
          },
        });
      }
    }

    if (this.isAutopilotPlan(content)) {
      this.enforceAutopilotTests(planPath, content, testsSection, issues);
    }

    return issues;
  }

  private extractTestsSection(content: string): string | null {
    const lines = content.split(/\r?\n/);
    const index = lines.findIndex((line) =>
      line.toLowerCase().includes("plan-authored tests"),
    );
    if (index === -1) {
      return null;
    }

    const section: string[] = [];
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

  private isAutopilotPlan(content: string): boolean {
    const normalized = content.toLowerCase();
    return AUTOPILOT_PLAN_KEYWORDS.some((pattern) => pattern.test(normalized));
  }

  private requiresDocsOnlyBypass(content: string): boolean {
    const normalized = content.toLowerCase();
    return DOC_ONLY_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private getPlanDocuments(): Array<{ path: string; content: string }> {
    if (this.cachedPlanDocs) {
      return this.cachedPlanDocs;
    }
    const evidenceRoot = path.join(this.workspaceRoot, "state", "evidence");
    const docs: Array<{ path: string; content: string }> = [];

    if (!fs.existsSync(evidenceRoot)) {
      this.cachedPlanDocs = docs;
      return docs;
    }

    const tasks = fs.readdirSync(evidenceRoot, { withFileTypes: true });
    for (const entry of tasks) {
      if (!entry.isDirectory()) {
        continue;
      }
      const planPath = path.join("state", "evidence", entry.name, "plan.md");
      const absolute = path.join(this.workspaceRoot, planPath);
      if (fs.existsSync(absolute)) {
        docs.push({
          path: normalizePath(planPath),
          content: fs.readFileSync(absolute, "utf8"),
        });
      }
    }

    this.cachedPlanDocs = docs;
    return docs;
  }

  private planMentionsTestPath(testPath: string): boolean {
    const normalizedTestPath = normalizePath(testPath);
    const planDocs = this.getPlanDocuments();
    return planDocs.some((doc) =>
      doc.content.includes(normalizedTestPath) ||
      doc.content.includes(normalizedTestPath.replace(/\.[^/.]+$/, "")),
    );
  }

  private enforceAutopilotTests(planPath: string, content: string, testsSection: string, issues: ProcessIssue[]): void {
    if (this.requiresDocsOnlyBypass(content)) {
      return;
    }
    const normalizedSection = testsSection.toLowerCase();
    const hasLiveKeyword = AUTOPILOT_TEST_KEYWORDS.some((pattern) => pattern.test(normalizedSection));
    if (!hasLiveKeyword) {
      issues.push({
        code: "autopilot_live_tests_missing",
        message: `${planPath} references autopilot work but does not list a Wave 0 live test.`,
        details: {
          tests_section: testsSection.trim(),
          guidance:
            "Add a PLAN-authored test describing the live Wave 0 loop (e.g., `npm run wave0`, `ps aux | grep wave0`, `TaskFlow Wave 0 live smoke`).",
        },
      });
    }
  }

  private enforceDailyAudit(now: Date, issues: ProcessIssue[]): void {
    const auditInfo = this.getLatestDailyAuditInfo();
    if (!auditInfo) {
      issues.push({
        code: "daily_audit_missing",
        message:
          "No daily artifact health report found. Run the daily checklist and commit `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md`.",
        details: {
          guidance:
            "Execute the checklist in docs/checklists/daily_artifact_health.md and commit the generated summary before proceeding.",
        },
      });
      return;
    }

    if (!auditInfo.summaryExists) {
      issues.push({
        code: "daily_audit_summary_missing",
        message: `Daily audit directory ${auditInfo.dir} is missing summary.md.`,
        details: {
          guidance: "Ensure the daily audit template is filled out and committed.",
        },
      });
    }

    if (now.getTime() - auditInfo.date.getTime() > DAILY_AUDIT_MAX_AGE_MS) {
      issues.push({
        code: "daily_audit_stale",
        message: `Latest daily artifact audit (${auditInfo.dir}) is older than 24 hours.`,
        details: {
          guidance:
            "Run the daily artifact health checklist now and commit the new summary before merging.",
        },
      });
    }
  }

  private enforceOverrideLedgerFreshness(now: Date, issues: ProcessIssue[]): void {
    const ledgerPath = path.join(this.workspaceRoot, ...OVERRIDE_LEDGER_PATH);
    if (!fs.existsSync(ledgerPath)) {
      issues.push({
        code: "override_ledger_missing",
        message: "state/overrides.jsonl not found; override actions must be logged and rotated daily.",
        details: {
          guidance:
            "Ensure override logging is configured. If this is intentional, document the decision and add the file (even if empty) to the repository.",
        },
      });
      return;
    }

    const content = fs.readFileSync(ledgerPath, "utf8");
    if (!content.trim()) {
      return;
    }

    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const staleEntries: string[] = [];
    const parseIssues: string[] = [];
    const cutoff = now.getTime() - DAILY_AUDIT_MAX_AGE_MS;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      try {
        const parsed = JSON.parse(line);
        const timestamp = parsed?.timestamp;
        if (!timestamp) {
          parseIssues.push(`Missing timestamp on line ${i + 1}`);
          continue;
        }
        const entryTime = Date.parse(timestamp);
        if (Number.isNaN(entryTime)) {
          parseIssues.push(`Invalid timestamp "${timestamp}" on line ${i + 1}`);
          continue;
        }
        if (entryTime <= cutoff) {
          staleEntries.push(`line ${i + 1} (${timestamp})`);
        }
      } catch (error) {
        parseIssues.push(
          `Unable to parse JSON on line ${i + 1}: ${(error && (error as Error).message) || error}`,
        );
      }
    }

    if (parseIssues.length > 0) {
      issues.push({
        code: "override_ledger_invalid",
        message: "Override ledger contains invalid entries.",
        details: {
          guidance:
            "Fix malformed lines in state/overrides.jsonl before proceeding.",
          warnings: parseIssues,
        },
      });
    }

    if (staleEntries.length > 0) {
      issues.push({
        code: "override_ledger_stale",
        message:
          "Override ledger has entries older than 24 hours. Run the rotation script before committing.",
        details: {
          guidance:
            "Execute `node tools/wvo_mcp/scripts/rotate_overrides.mjs` and commit the updated ledger + archive.",
          entries: staleEntries,
        },
      });
    }

  }

  private getLatestDailyAuditInfo():
    | { dir: string; date: Date; summaryExists: boolean }
    | null {
    const evidenceRoot = path.join(this.workspaceRoot, "state", "evidence");
    if (!fs.existsSync(evidenceRoot)) {
      return null;
    }
    const entries = fs.readdirSync(evidenceRoot, { withFileTypes: true });
    const audits = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const match = entry.name.match(DAILY_AUDIT_DIR_REGEX);
        if (!match) {
          return null;
        }
        const [, year, month, day] = match;
        const date = new Date(
          Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
        );
        return {
          dir: entry.name,
          date,
          summaryExists: fs.existsSync(
            path.join(evidenceRoot, entry.name, "summary.md"),
          ),
        };
      })
      .filter((entry): entry is { dir: string; date: Date; summaryExists: boolean } => entry !== null);

    if (audits.length === 0) {
      return null;
    }

    audits.sort((a, b) => b.date.getTime() - a.date.getTime());
    return audits[0];
  }
}
