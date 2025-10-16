import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

function ensureLayouts(content: string): void {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.breakpoints) || parsed.breakpoints.length < 4) {
    throw new Error("layouts.json breakpoints must cover mobile, tablet, desktop, and widescreen.");
  }
  if (!parsed.components || typeof parsed.components !== "object") {
    throw new Error("layouts.json must include component layout definitions.");
  }
}

export class ResponsiveSurfaceCritic extends Critic {
  name = "responsive_surface";
  description =
    "Ensures responsive layouts, device gestures, and testing reports are maintained.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/responsive/layouts.json",
        minLength: 600,
        validator: ensureLayouts,
        mustContain: ["mobile", "tablet", "desktop", "large"],
      },
      {
        relativePath: "state/artifacts/responsive/testing_report.md",
        minLength: 700,
        mustContain: [
          "lighthouse",
          "webpagetest",
          "accessibility",
          "touch gestures",
          "performance budget",
        ],
      },
    ]);

    if (
      outcome.missing.length ||
      outcome.tooShort.length ||
      outcome.missingTokens.length ||
      outcome.validatorFailures.length
    ) {
      return this.fail(
        "Responsive surface documentation is incomplete.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Responsive surface assets verified.",
      outcome.details,
    );
  }
}
