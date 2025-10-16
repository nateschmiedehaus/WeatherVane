import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

function ensurePersonaMatrix(content: string): void {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.personas) || parsed.personas.length < 3) {
    throw new Error("persona_matrix.json must define at least three personas.");
  }
  const required = ["CMO", "Marketer", "Analyst"];
  const labels: string[] = parsed.personas.map((p: { id?: string; label?: string }) => {
    const value =
      typeof p.label === "string"
        ? p.label
        : typeof p.id === "string"
          ? p.id
          : "";
    return value.toLowerCase();
  });
  const missing = required.filter((persona) => {
    const target = persona.toLowerCase();
    for (const label of labels) {
      if (label.includes(target)) {
        return false;
      }
    }
    return true;
  });
  if (missing.length > 0) {
    throw new Error(
      `persona_matrix.json missing personas: ${missing.join(", ")}`,
    );
  }
}

export class StakeholderNarrativeCritic extends Critic {
  name = "stakeholder_narrative";
  description =
    "Ensures stakeholder narratives, value props, and comms assets are fresh and aligned with weather-driven insights.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/stakeholder/narrative.md",
        minLength: 1000,
        mustContain: [
          "CMO",
          "marketing operations",
          "analyst",
          "return on investment",
          "weather signal",
          "storytelling",
          "executive summary",
        ],
      },
      {
        relativePath: "state/artifacts/stakeholder/persona_matrix.json",
        minLength: 400,
        validator: ensurePersonaMatrix,
      },
    ]);

    if (
      outcome.missing.length ||
      outcome.tooShort.length ||
      outcome.missingTokens.length ||
      outcome.validatorFailures.length
    ) {
      return this.fail(
        "Stakeholder narrative assets need attention.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Stakeholder narratives and persona matrix validated.",
      outcome.details,
    );
  }
}
