import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

export class ExperienceFlowCritic extends Critic {
  name = "experience_flow";
  description =
    "Ensures the end-to-end WeatherVane experience journey and demo script are intentionally documented.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/experience_flow/journey.md",
        minLength: 1000,
        mustContain: [
          "awareness",
          "onboarding",
          "scenario",
          "execution",
          "follow-up",
          "weather insight",
        ],
      },
      {
        relativePath: "state/artifacts/experience_flow/demo_script.md",
        minLength: 800,
        mustContain: [
          "demo flow",
          "story",
          "conversion",
          "call to action",
          "weather animation",
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
        "Experience flow assets are incomplete.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Experience flow journey and demo script verified.",
      outcome.details,
    );
  }
}
