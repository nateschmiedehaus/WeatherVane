import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

function ensureIntegrationMatrix(content: string): void {
  const parsed = JSON.parse(content);
  const required = ["weather", "marketing", "analytics", "payments"];
  const domains = Object.keys(parsed);
  const missing = required.filter(
    (domain) => !domains.includes(domain),
  );
  if (missing.length > 0) {
    throw new Error(
      `integration_matrix missing domains: ${missing.join(", ")}`,
    );
  }
}

export class IntegrationCompletenessCritic extends Critic {
  name = "integration_completeness";
  description =
    "Confirms API integrations (weather, marketing, analytics, payments) are mapped, tested, and monitored.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/integration/integration_matrix.json",
        minLength: 400,
        validator: ensureIntegrationMatrix,
      },
      {
        relativePath: "state/artifacts/integration/test_report.md",
        minLength: 600,
        mustContain: [
          "Postman",
          "contract testing",
          "webhooks",
          "resilience",
          "alerts",
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
        "Integration matrix and test reports are incomplete.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Integration matrix and resilience testing look excellent.",
      outcome.details,
    );
  }
}
