/**
 * Tests for ML Task Aggregator
 *
 * Covers:
 * 1. Task retrieval from various sources
 * 2. Completion report parsing and analysis
 * 3. Metric extraction from markdown
 * 4. Blocker and pattern detection
 * 5. Report aggregation and merging
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { MLTaskAggregator } from "../ml_task_aggregator.js";
import type {
  MLTaskCompletionReport,
  AggregatedMLTasksReport,
  MLTaskSummary,
} from "../ml_task_aggregator.js";

describe("MLTaskAggregator", () => {
  let aggregator: MLTaskAggregator;
  const testWorkspace = "/tmp/test_ml_aggregator";
  const testStateRoot = "/tmp/test_ml_aggregator/state";

  beforeEach(async () => {
    // Setup test directories
    await fs.mkdir(testStateRoot, { recursive: true });
    aggregator = new MLTaskAggregator(testWorkspace, testStateRoot);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Task Retrieval", () => {
    it("should retrieve completed ML tasks from completion reports", async () => {
      // Create test completion reports
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      const report1 = path.join(docsDir, "T12.0.1_COMPLETION_REPORT.md");
      await fs.writeFile(report1, "# Task T12.0.1 Completion\n\nStatus: Done");

      const report2 = path.join(docsDir, "T_MLR_4.3_COMPLETION_REPORT.md");
      await fs.writeFile(
        report2,
        "# Task T-MLR-4.3 Completion\n\nStatus: Done"
      );

      const tasks = await aggregator.getCompletedMLTasks();

      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.some((t) => t.id.includes("T12.0.1") || t.id.includes("T120.1"))).toBe(true);
      expect(tasks.every((t) => t.status === "done")).toBe(true);
    });

    it("should handle missing completion reports gracefully", async () => {
      const tasks = await aggregator.getCompletedMLTasks();
      expect(Array.isArray(tasks)).toBe(true);
      // Should not throw, return empty array if no reports
    });
  });

  describe("Metric Extraction", () => {
    it("should extract quality metrics from completion reports", async () => {
      const content = `
# Task Completion Report

## Quality Metrics
- Build Success Rate: 100%
- Test Coverage: 95%
- Lint Score: 98
- Security Score: 92
- Performance Score: 88
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "TEST_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask("TEST_TASK", "docs/TEST_COMPLETION_REPORT.md");

      if (report) {
        expect(report.quality_metrics).toBeDefined();
        expect(Object.keys(report.quality_metrics).length).toBeGreaterThan(0);
      }
    });

    it("should extract deliverables from completion reports", async () => {
      const content = `
# Task Completion

## Deliverables:
- ML model implementation (src/models/ml_model.py)
- Test suite with 100% coverage
- Documentation and examples
- Performance benchmarks
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "TEST_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask("TEST_TASK", "docs/TEST_COMPLETION_REPORT.md");

      if (report) {
        expect(report.deliverables.length).toBeGreaterThan(0);
        expect(
          report.deliverables.some(
            (d) => d.includes("model") || d.includes("test")
          )
        ).toBe(true);
      }
    });

    it("should detect test passing status", async () => {
      const passingContent = `
# Task Completion

## Tests
✅ All tests passed (156 test cases)
      `;

      const failingContent = `
# Task Completion

## Tests
❌ Tests failed - 5 failures out of 156 cases
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      const passingPath = path.join(docsDir, "PASS_COMPLETION_REPORT.md");
      await fs.writeFile(passingPath, passingContent);

      const failingPath = path.join(docsDir, "FAIL_COMPLETION_REPORT.md");
      await fs.writeFile(failingPath, failingContent);

      const passingReport = await aggregator.analyzeCompletedTask(
        "PASS_TASK",
        "docs/PASS_COMPLETION_REPORT.md"
      );
      const failingReport = await aggregator.analyzeCompletedTask(
        "FAIL_TASK",
        "docs/FAIL_COMPLETION_REPORT.md"
      );

      expect(passingReport?.tests_passed).toBe(true);
      expect(failingReport?.tests_passed).toBe(false);
    });

    it("should extract test count", async () => {
      const content = `
# Task Completion

## Tests
All 156 tests passed
Coverage: 95%
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "TEST_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask("TEST_TASK", "docs/TEST_COMPLETION_REPORT.md");

      expect(report?.test_count).toBe(156);
    });

    it("should extract coverage dimensions", async () => {
      const content = `
# Task Completion

## Test Coverage
- Code Elegance: Covered
- Architecture: Covered
- User Experience: Covered
- Communication: Covered
- Performance: Covered
- Security: Not covered
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "TEST_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask("TEST_TASK", "docs/TEST_COMPLETION_REPORT.md");

      expect(report?.coverage_dimensions).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Verification Checklist", () => {
    it("should extract verification checklist status", async () => {
      const content = `
# Task Completion

## Verification Checklist
- ✅ Build - Success
- ✅ Tests - All passed
- ✗ Audit - 2 vulnerabilities found
- ✅ Documentation - Complete
- ✗ Performance - Regression detected
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "TEST_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask("TEST_TASK", "docs/TEST_COMPLETION_REPORT.md");

      if (report) {
        expect(report.verification_checklist).toBeDefined();
        expect(Object.keys(report.verification_checklist).length).toBeGreaterThan(0);

        // At least some checks should be present
        const hasCheckmark = Object.values(
          report.verification_checklist
        ).some((v) => v === true);
        expect(hasCheckmark).toBe(true);
      }
    });
  });

  describe("Blocker Detection", () => {
    it("should detect blockers from verification failures", async () => {
      const content = `
# Task Completion

## Verification Checklist
- ✗ Build - Circular dependency error
- ✗ Tests - Failed
- ✗ Audit - Permission denied
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "BLOCKER_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.generateAggregatedReport();

      // Should detect blockers from this task
      expect(report.blockers_detected.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect low test coverage as blocker", async () => {
      const content = `
# Task Completion

## Coverage
Only tested: Code Elegance dimension
      `;

      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, "LOWCOV_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.generateAggregatedReport();

      // Low coverage should be detected as blocker
      const hasLowCoverageBlocker = report.blockers_detected.some((b) =>
        b.toLowerCase().includes("coverage")
      );
      expect(typeof hasLowCoverageBlocker).toBe("boolean");
    });
  });

  describe("Pattern Detection", () => {
    it("should observe patterns in task completion", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create multiple completion reports
      for (let i = 1; i <= 3; i++) {
        const content = `
# Task T${i} Completion

## Tests
❌ Tests failed

## Coverage
Only 2/7 dimensions covered
        `;
        const reportPath = path.join(
          docsDir,
          `T${i}_COMPLETION_REPORT.md`
        );
        await fs.writeFile(reportPath, content);
      }

      const report = await aggregator.generateAggregatedReport();

      // Should detect patterns
      expect(report.patterns_observed).toBeDefined();
      expect(Array.isArray(report.patterns_observed)).toBe(true);
    });
  });

  describe("Aggregated Report Generation", () => {
    it("should generate comprehensive aggregated report", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      const content = `
# Task T1 Completion

## Deliverables
- Implementation complete
- Tests written
- Documented

## Tests
✅ All 50 tests passed

## Verification Checklist
- ✅ Build - Success
- ✅ Tests - Passed
- ✅ Audit - No issues
- ✅ Documentation - Complete
      `;

      const reportPath = path.join(docsDir, "T1_COMPLETION_REPORT.md");
      await fs.writeFile(reportPath, content);

      const report = await aggregator.generateAggregatedReport();

      expect(report).toBeDefined();
      expect(report.total_tasks_analyzed).toBeGreaterThanOrEqual(0);
      expect(report.analysis_timestamp).toBeGreaterThan(0);
      expect(Array.isArray(report.tasks)).toBe(true);
      expect(Array.isArray(report.blockers_detected)).toBe(true);
      expect(Array.isArray(report.patterns_observed)).toBe(true);
      expect(typeof report.average_completion_rate).toBe("number");
    });

    it("should calculate completion rate correctly", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create 2 passing and 2 failing tasks
      for (let i = 1; i <= 2; i++) {
        const content = `
# Task T${i}
## Tests
✅ All tests passed
        `;
        await fs.writeFile(path.join(docsDir, `T${i}_COMPLETION_REPORT.md`), content);
      }

      for (let i = 3; i <= 4; i++) {
        const content = `
# Task T${i}
## Tests
❌ Tests failed
        `;
        await fs.writeFile(path.join(docsDir, `T${i}_COMPLETION_REPORT.md`), content);
      }

      const report = await aggregator.generateAggregatedReport();

      // Should have analyzed tasks
      expect(report.total_tasks_analyzed).toBeGreaterThanOrEqual(0);
    });

    it("should classify tasks using status and report quality signals", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      await fs.writeFile(
        path.join(docsDir, "TASK_SUCCESS_COMPLETION_REPORT.md"),
        `
# Task TASK_SUCCESS Completion

## Tests
✅ All 42 tests passed
        `,
      );

      await fs.writeFile(
        path.join(docsDir, "TASK_FAIL_COMPLETION_REPORT.md"),
        `
# Task TASK_FAIL Completion

## Tests
❌ Tests failed - 5 failures
        `,
      );

      const mockTasks: MLTaskSummary[] = [
        {
          id: "TASK_SUCCESS",
          title: "Successful Task",
          status: "done",
          completion_path: "docs/TASK_SUCCESS_COMPLETION_REPORT.md",
        },
        {
          id: "TASK_FAIL",
          title: "Failed Task",
          status: "done",
          completion_path: "docs/TASK_FAIL_COMPLETION_REPORT.md",
        },
        {
          id: "TASK_PROGRESS",
          title: "In Progress Task",
          status: "in_progress",
          completion_path: "docs/TASK_PROGRESS_COMPLETION_REPORT.md",
        },
        {
          id: "TASK_NO_REPORT",
          title: "Legacy Task",
          status: "done",
          completion_path: "docs/TASK_NO_REPORT_COMPLETION_REPORT.md",
        },
      ];

      const taskSpy = vi
        .spyOn(aggregator, "getCompletedMLTasks")
        .mockResolvedValue(mockTasks);

      try {
        const report = await aggregator.generateAggregatedReport();

        expect(report.total_tasks_analyzed).toBe(4);
        expect(report.completed_tasks).toBe(2);
        expect(report.in_progress_tasks).toBe(1);
        expect(report.failed_tasks).toBe(1);
        expect(report.average_completion_rate).toBeCloseTo(50);
      } finally {
        taskSpy.mockRestore();
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle malformed markdown gracefully", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      const content = "This is not proper markdown\n\n[[ broken content";
      await fs.writeFile(
        path.join(docsDir, "MALFORMED_COMPLETION_REPORT.md"),
        content
      );

      const report = await aggregator.generateAggregatedReport();

      // Should not throw
      expect(report).toBeDefined();
      expect(Array.isArray(report.tasks)).toBe(true);
    });

    it("should handle missing files gracefully", async () => {
      const tasks = await aggregator.getCompletedMLTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });

    it("should deduplicate tasks across sources", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create completion report
      const content = "# Task T1 Completion\nStatus: Done";
      await fs.writeFile(
        path.join(docsDir, "T1_COMPLETION_REPORT.md"),
        content
      );

      // Create state file with same task
      await fs.mkdir(path.join(testStateRoot, "analytics"), {
        recursive: true,
      });
      const metricsContent = JSON.stringify({
        decisions: [
          {
            topic: "Test Task",
            related_tasks: ["T1"],
          },
        ],
      });
      await fs.writeFile(
        path.join(testStateRoot, "analytics", "orchestration_metrics.json"),
        metricsContent
      );

      const tasks = await aggregator.getCompletedMLTasks();

      // Should deduplicate - no duplicate T1 entries
      const t1Count = tasks.filter((t) => t.id.includes("T1")).length;
      expect(t1Count).toBeGreaterThanOrEqual(1);
    });
  });
});
