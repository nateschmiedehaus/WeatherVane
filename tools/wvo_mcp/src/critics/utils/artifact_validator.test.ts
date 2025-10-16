import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateArtifacts,
  buildFailureMessage,
  type ArtifactRequirement,
} from "./artifact_validator.js";

describe("artifact validator", () => {
  it("captures missing files, short content, and missing tokens", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "artifact-validator-"));
    const requirements: ArtifactRequirement[] = [
      {
        relativePath: "state/artifacts/demo/plan.md",
        minLength: 50,
        mustContain: ["call to action", "weather"],
      },
      {
        relativePath: "state/artifacts/demo/metrics.json",
        minLength: 10,
        mustContain: ["conversion"],
        validator: (content) => {
          if (!content.includes("timeToValue")) {
            throw new Error("metrics missing timeToValue");
          }
        },
      },
    ];

    mkdirSync(path.join(workspace, "state/artifacts/demo"), { recursive: true });
    writeFileSync(
      path.join(workspace, "state/artifacts/demo/metrics.json"),
      JSON.stringify({ conversion: 0.3 }, null, 2),
      "utf8",
    );

    const outcome = await validateArtifacts(workspace, requirements);

    expect(outcome.missing).toEqual(["state/artifacts/demo/plan.md"]);
    expect(outcome.tooShort).toHaveLength(0);
    expect(outcome.missingTokens).toHaveLength(0);
    expect(outcome.validatorFailures).toHaveLength(1);
    const message = buildFailureMessage(outcome);
    expect(message).toContain("Missing artifacts");
    expect(message).toContain("Validation failures");
  });

  it("returns empty findings when artifacts satisfy requirements", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "artifact-validator-pass-"));
    const requirements: ArtifactRequirement[] = [
      {
        relativePath: "state/artifacts/demo/plan.md",
        minLength: 50,
        mustContain: ["call to action", "weather"],
      },
    ];

    mkdirSync(path.join(workspace, "state/artifacts/demo"), { recursive: true });
    const content = `Weather plan with a call to action. ${"weather".repeat(10)}`;
    writeFileSync(path.join(workspace, "state/artifacts/demo/plan.md"), content, "utf8");

    const outcome = await validateArtifacts(workspace, requirements);
    expect(outcome.missing).toHaveLength(0);
    expect(outcome.tooShort).toHaveLength(0);
    expect(outcome.missingTokens).toHaveLength(0);
    expect(outcome.validatorFailures).toHaveLength(0);
  });
});
