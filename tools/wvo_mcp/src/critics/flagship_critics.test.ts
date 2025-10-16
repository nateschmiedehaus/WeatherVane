import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ExperienceFlowCritic } from "./experience_flow.js";
import { InspirationCoverageCritic } from "./inspiration_coverage.js";

const REPEAT_BLOCK = "awareness onboarding scenario execution follow-up weather insight ";

function writeFile(workspace: string, relative: string, content: string) {
  const target = path.join(workspace, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

describe("Flagship critics", () => {
  it("passes the experience flow critic when artifacts are rich", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "experience-flow-"));
    const journey = (REPEAT_BLOCK + "storytelling cadence ").repeat(25);
    const demoScript = "demo flow story conversion call to action weather animation ".repeat(20);

    writeFile(workspace, "state/artifacts/experience_flow/journey.md", journey);
    writeFile(workspace, "state/artifacts/experience_flow/demo_script.md", demoScript);

    const critic = new ExperienceFlowCritic(workspace);
    const result = await critic.run("high");
    expect(result.passed).toBe(true);
    expect(result.stdout).toContain("Experience flow journey and demo script verified");
  });

  it("fails inspiration coverage when references or analysis are missing", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "inspiration-coverage-fail-"));
    const critic = new InspirationCoverageCritic(workspace);
    const result = await critic.run("high");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("Creative inspiration coverage is insufficient");
  });

  it("passes inspiration coverage when directories and analysis exist", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "inspiration-coverage-pass-"));
    const analysisContent = [
      "Framer Webflow Awwwards SiteInspire",
      "motion language informs transitions",
      "color theory drives palette decisions",
      "interaction cue design ensures clarity",
    ].join("\n");
    writeFile(
      workspace,
      "state/artifacts/inspiration/analysis.md",
      (analysisContent + " inspiration narrative ").repeat(20),
    );

    mkdirSync(path.join(workspace, "state/web_inspiration/ref1"), { recursive: true });
    mkdirSync(path.join(workspace, "state/web_inspiration/ref2"), { recursive: true });
    mkdirSync(path.join(workspace, "state/web_inspiration/ref3"), { recursive: true });

    const critic = new InspirationCoverageCritic(workspace);
    const result = await critic.run("high");
    expect(result.passed).toBe(true);
    expect(result.stdout).toContain("Inspiration catalogue curated with actionable analysis");
  });
});
