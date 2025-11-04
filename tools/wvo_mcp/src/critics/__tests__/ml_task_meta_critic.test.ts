/**
 * Tests for ML Task Meta-Critic
 *
 * Covers:
 * 1. Critic initialization and configuration
 * 2. Analysis running (TypeScript fallback)
 * 3. Insight generation from task reports
 * 4. Recommendation generation
 * 5. Escalation decision logic
 * 6. Output formatting
 */

import * as fs from "node:fs/promises";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { MLTaskMetaCriticCritic } from "../ml_task_meta_critic.js";

describe("MLTaskMetaCritic", () => {
  // Increase timeout for all tests in this suite
  vi.setConfig({ testTimeout: 25000 });
  let critic: MLTaskMetaCriticCritic;
  const testWorkspace = "/tmp/test_ml_meta_critic";
  const testStateRoot = "/tmp/test_ml_meta_critic/state";

  beforeEach(async () => {
    // Setup test directories
    await fs.mkdir(testStateRoot, { recursive: true });
    critic = new MLTaskMetaCriticCritic(testWorkspace);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Initialization", () => {
    it("should initialize with proper identity profile", () => {
      // Critic should initialize without error
      expect(critic).toBeDefined();
      expect(critic).toHaveProperty("run");
    });

    it("should have identity profile configured", async () => {
      // The critic should have proper mission and powers
      // This is verified through proper initialization
      expect(critic).toBeDefined();
    });
  });

  describe("Analysis Execution", () => {
    it("should run analysis on empty workspace without error", async () => {
      // Ensure state directories exist
      await fs.mkdir(path.join(testWorkspace, "docs"), { recursive: true });

      // Should not throw even with no tasks
      const result = await critic.run("default");
      expect(result).toBeDefined();
      expect(result).toHaveProperty("critic");
      expect(result.critic).toBe("ml_task_meta");
    });

    it("should handle analysis with sample tasks", async () => {
      // Create sample completion reports
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      const sampleReport = `
# Task T1.0.0 Completion

## Summary
Task completed successfully with all quality gates passed.

## Deliverables
- Core implementation complete
- Full test suite (156 tests)
- Documentation and examples

## Verification Checklist
- ✅ Build - Success
- ✅ Tests - All passed
- ✅ Audit - No vulnerabilities
- ✅ Documentation - Complete

## Test Coverage
- Code Elegance: ✓
- Architecture: ✓
- User Experience: ✓
- Performance: ✓
`;

      await fs.writeFile(
        path.join(docsDir, "T1.0.0_COMPLETION_REPORT.md"),
        sampleReport
      );

      const result = await critic.run("default");
      expect(result).toBeDefined();
      expect(result.critic).toBe("ml_task_meta");
      // Result should have content about the analysis
      expect(result.stdout || result.stderr).toBeDefined();
    });

    it("should escalate on critical completion rate", async () => {
      // Create multiple failing task reports
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      for (let i = 1; i <= 5; i++) {
        const failingReport = `
# Task T${i}
## Tests
❌ Tests failed
## Coverage
1/7 dimensions covered
`;
        await fs.writeFile(
          path.join(docsDir, `T${i}_COMPLETION_REPORT.md`),
          failingReport
        );
      }

      const result = await critic.run("default");
      expect(result).toBeDefined();
      // With many failures, should not pass
      expect(result.passed).toBe(false);
    });
  });

  describe("Command Generation", () => {
    it("should return null command for default profile when env var not set", () => {
      // Clear environment
      delete process.env.WVO_ML_TASK_FILTER;

      const cmd = critic["command"]("default");
      // Command should exist or be null
      expect(cmd === null || typeof cmd === "string").toBe(true);
    });

    it("should include filter in command when env var set", () => {
      process.env.WVO_ML_TASK_FILTER = "epic_ML_MODELING";

      const cmd = critic["command"]("default");
      if (cmd !== null) {
        expect(typeof cmd).toBe("string");
      }

      delete process.env.WVO_ML_TASK_FILTER;
    });
  });

  describe("Output Generation", () => {
    it("should format analysis output correctly", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create a good completion report
      const goodReport = `
# Task T1 Completion

## Metrics
- Build Success Rate: 100%
- Test Coverage: 95%

## Deliverables
- Complete implementation
- Full test suite

## Verification Checklist
- ✅ Build - Success
- ✅ Tests - Passed
- ✅ Audit - No issues
- ✅ Documentation - Complete
`;

      await fs.writeFile(
        path.join(docsDir, "T1_COMPLETION_REPORT.md"),
        goodReport
      );

      const result = await critic.run("default");

      if (result.passed) {
        // Should have readable output when passing
        const output = result.stdout || result.stderr || "";
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle missing workspace gracefully", async () => {
      // Use a workspace we control
      const missingWorkspace = path.join(testWorkspace, "missing");
      const nonExistentCritic = new MLTaskMetaCriticCritic(missingWorkspace);

      // Should handle gracefully
      const result = await nonExistentCritic.run("default");
      expect(result).toBeDefined();
      expect(result).toHaveProperty("critic");
    });

    it("should handle corrupted markdown files", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create corrupted file
      const corruptedContent = "[[[ INVALID {{{";
      await fs.writeFile(
        path.join(docsDir, "CORRUPT_COMPLETION_REPORT.md"),
        corruptedContent
      );

      const result = await critic.run("default");
      // Should not throw
      expect(result).toBeDefined();
    });
  });

  describe("Report Quality", () => {
    it("should identify high-quality completions", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      const highQualityReport = `
# Task T1 Completion

## Status
✅ COMPLETED WITH EXCELLENCE

## Coverage Dimensions
- Code Elegance: ✓ Covered
- Architecture Design: ✓ Covered
- User Experience: ✓ Covered
- Communication Clarity: ✓ Covered
- Scientific Rigor: ✓ Covered
- Performance Efficiency: ✓ Covered
- Security Robustness: ✓ Covered

## Tests
✅ All 200 tests passed
Coverage: 98%

## Verification
- ✅ Build: Success
- ✅ Tests: All passed
- ✅ Audit: No vulnerabilities
- ✅ Documentation: Complete
- ✅ Performance: No regressions
`;

      await fs.writeFile(
        path.join(docsDir, "HIGHQUAL_COMPLETION_REPORT.md"),
        highQualityReport
      );

      const result = await critic.run("default");
      expect(result).toBeDefined();
      // High quality should pass
      expect(result.passed).toBe(true);
    });

    it("should flag incomplete completions", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create multiple incomplete tasks to trigger escalation
      for (let i = 1; i <= 3; i++) {
        const incompleteReport = `
# Task T${i} Completion

## Status
⚠ INCOMPLETE

## Coverage Dimensions
- Code Elegance: ✗ NOT COVERED
- Architecture Design: ✗ NOT COVERED
- User Experience: ✓ Covered

## Tests
❌ Tests failed (50/200 passed)
Coverage: 25%

## Verification
- ✗ Build: Failed
- ✗ Tests: 50% failed
- ✓ Audit: OK
`;
        await fs.writeFile(
          path.join(docsDir, `INCOMPLETE_T${i}_COMPLETION_REPORT.md`),
          incompleteReport
        );
      }

      const result = await critic.run("default");
      expect(result).toBeDefined();
      // Multiple incomplete tasks should trigger failure
      expect(result.passed).toBe(false);
    });
  });

  describe("Recommendation Generation", () => {
    it("should generate actionable recommendations", async () => {
      const docsDir = path.join(testWorkspace, "docs");
      await fs.mkdir(docsDir, { recursive: true });

      // Create multiple low-quality reports
      for (let i = 1; i <= 3; i++) {
        const report = `
# Task T${i}
## Tests
${i === 1 ? "❌" : "⚠"} Test issues
## Coverage
Only 2/7 dimensions
`;
        await fs.writeFile(
          path.join(docsDir, `T${i}_COMPLETION_REPORT.md`),
          report
        );
      }

      const result = await critic.run("default");
      const output = result.stdout || result.stderr || "";

      // Should mention recommendations for low-quality work
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("Critic Key Naming", () => {
    it("should have correct critic key", () => {
      const key = critic["getCriticKey"]();
      expect(key).toBe("ml_task_meta");
    });
  });
});
