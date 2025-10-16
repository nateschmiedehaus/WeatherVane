import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

function ensurePrototypeLinks(content: string): void {
  const urls = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http"));
  if (urls.length < 3) {
    throw new Error("Expect at least three prototype links (Framer, Lottie, etc.).");
  }
}

export class MotionDesignCritic extends Critic {
  name = "motion_design";
  description =
    "Checks that motion language, timing, and prototypes are documented across weather states.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/motion/motion_specs.md",
        minLength: 900,
        mustContain: [
          "easing",
          "timeline",
          "framer motion",
          "weather transition",
          "micro-interaction",
          "fps",
        ],
      },
      {
        relativePath: "state/artifacts/motion/prototype_links.md",
        minLength: 200,
        validator: ensurePrototypeLinks,
        mustContain: ["framer", "lottie", "after effects"],
      },
    ]);

    if (
      outcome.missing.length ||
      outcome.tooShort.length ||
      outcome.missingTokens.length ||
      outcome.validatorFailures.length
    ) {
      return this.fail(
        "Motion design artifacts are incomplete.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Motion design specifications verified.",
      outcome.details,
    );
  }
}
