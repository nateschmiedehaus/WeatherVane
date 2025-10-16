import fs from "node:fs/promises";
import path from "node:path";

import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

async function countInspirationEntries(workspace: string): Promise<number> {
  const baseDir = path.join(workspace, "state", "web_inspiration");
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

export class InspirationCoverageCritic extends Critic {
  name = "inspiration_coverage";
  description =
    "Validates that a rich set of creative references is curated and synthesised for the current workstream.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const inspirationCount = await countInspirationEntries(this.workspaceRoot);
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/inspiration/analysis.md",
        minLength: 900,
        mustContain: [
          "Framer",
          "Webflow",
          "Awwwards",
          "SiteInspire",
          "motion language",
          "color theory",
          "interaction cue",
        ],
      },
    ]);

    if (inspirationCount < 3) {
      outcome.details.push(
        `state/web_inspiration requires curated sets from multiple sources (found ${inspirationCount}).`,
      );
      outcome.missing.push("state/web_inspiration/<inspiration-sets>");
    }

    if (
      outcome.missing.length ||
      outcome.tooShort.length ||
      outcome.missingTokens.length ||
      outcome.validatorFailures.length
    ) {
      return this.fail(
        "Creative inspiration coverage is insufficient.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Inspiration catalogue curated with actionable analysis.",
      outcome.details,
    );
  }
}
