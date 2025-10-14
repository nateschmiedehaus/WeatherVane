import { describe, expect, it } from "vitest";

import {
  detectOutputFormat,
  OutputValidationError,
  validateDiff,
  validateJSON,
  resolveOutputValidationSettings,
} from "../utils/output_validator.js";

describe("output_validator", () => {
  it("validates codex_output_schema JSON", () => {
    const payload = JSON.stringify({
      completed_tasks: ["task-1"],
      in_progress: [],
      blockers: [],
      next_focus: ["T9.2.1"],
      notes: "All good.",
    });

    const parsed = validateJSON(payload);
    expect(parsed.completed_tasks).toEqual(["task-1"]);
    expect(parsed.notes).toBe("All good.");
  });

  it("rejects JSON missing required fields", () => {
    const payload = JSON.stringify({
      completed_tasks: [],
      notes: "partial",
    });

    expect(() => validateJSON(payload)).toThrow(OutputValidationError);
    try {
      validateJSON(payload);
    } catch (error) {
      expect(error).toBeInstanceOf(OutputValidationError);
      expect((error as OutputValidationError).code).toBe("invalid_json_schema");
    }
  });

  it("accepts apply_patch style diffs", () => {
    const diff = `*** Begin Patch
*** Update File: src/example.ts
@@
-const value = 1;
+const value = 2;
*** End Patch
`;

    expect(() => validateDiff(diff)).not.toThrow();
  });

  it("accepts git diff style patches", () => {
    const diff = `diff --git a/src/example.ts b/src/example.ts
index e69de29..4b825dc 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -0,0 +1,3 @@
+export function greet() {
+  return "hello";
+}
`;

    expect(() => validateDiff(diff)).not.toThrow();
  });

  it("detects invalid diff output", () => {
    expect(() => validateDiff("random text")).toThrow(OutputValidationError);
    try {
      validateDiff("random text");
    } catch (error) {
      expect(error).toBeInstanceOf(OutputValidationError);
      expect((error as OutputValidationError).code).toBe("diff_missing_header");
    }
  });

  it("detects output format for JSON and diff", () => {
    const jsonPayload = JSON.stringify({
      completed_tasks: [],
      in_progress: [],
      blockers: [],
      next_focus: [],
      notes: "ok",
    });

    expect(detectOutputFormat(jsonPayload)).toBe("json");

    const diffPayload = `*** Begin Patch
*** Delete File: src/old.ts
*** End Patch
`;

    expect(detectOutputFormat(diffPayload)).toBe("diff");
  });

  it("rejects unexpected output format", () => {
    expect(() => detectOutputFormat("hello world")).toThrow(OutputValidationError);
  });

  it("defaults to shadow mode when not configured", () => {
    const previousMode = process.env.WVO_OUTPUT_VALIDATION_MODE;
    const previousCanary = process.env.WVO_OUTPUT_VALIDATION_CANARY;
    delete process.env.WVO_OUTPUT_VALIDATION_MODE;
    delete process.env.WVO_OUTPUT_VALIDATION_CANARY;

    const settings = resolveOutputValidationSettings();
    expect(settings.configuredMode).toBe("shadow");
    expect(settings.effectiveMode).toBe("shadow");
    expect(settings.canaryAcknowledged).toBe(false);

    if (previousMode === undefined) {
      delete process.env.WVO_OUTPUT_VALIDATION_MODE;
    } else {
      process.env.WVO_OUTPUT_VALIDATION_MODE = previousMode;
    }
    if (previousCanary === undefined) {
      delete process.env.WVO_OUTPUT_VALIDATION_CANARY;
    } else {
      process.env.WVO_OUTPUT_VALIDATION_CANARY = previousCanary;
    }
  });

  it("requires canary acknowledgement before enforcing validation", () => {
    const previousMode = process.env.WVO_OUTPUT_VALIDATION_MODE;
    const previousCanary = process.env.WVO_OUTPUT_VALIDATION_CANARY;
    process.env.WVO_OUTPUT_VALIDATION_MODE = "enforce";
    delete process.env.WVO_OUTPUT_VALIDATION_CANARY;

    const shadowSettings = resolveOutputValidationSettings();
    expect(shadowSettings.configuredMode).toBe("enforce");
    expect(shadowSettings.effectiveMode).toBe("shadow");
    expect(shadowSettings.canaryAcknowledged).toBe(false);

    process.env.WVO_OUTPUT_VALIDATION_CANARY = "1";
    const enforceSettings = resolveOutputValidationSettings();
    expect(enforceSettings.effectiveMode).toBe("enforce");
    expect(enforceSettings.canaryAcknowledged).toBe(true);

    if (previousMode === undefined) {
      delete process.env.WVO_OUTPUT_VALIDATION_MODE;
    } else {
      process.env.WVO_OUTPUT_VALIDATION_MODE = previousMode;
    }
    if (previousCanary === undefined) {
      delete process.env.WVO_OUTPUT_VALIDATION_CANARY;
    } else {
      process.env.WVO_OUTPUT_VALIDATION_CANARY = previousCanary;
    }
  });
});
