import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

function ensureMetrics(content: string): void {
  const parsed = JSON.parse(content);
  const required = ["conversionRate", "timeToValue", "signupFunnel", "weatherHook"];
  const missing = required.filter((key) => !(key in parsed));
  if (missing.length > 0) {
    throw new Error(`metrics.json missing keys: ${missing.join(", ")}`);
  }
}

export class DemoConversionCritic extends Critic {
  name = "demo_conversion";
  description =
    "Verifies the WeatherVane demo is polished, fast, and ready to convert customers.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/demo/demo_plan.md",
        minLength: 900,
        mustContain: [
          "value proposition",
          "weather-driven insight",
          "call to action",
          "setup time",
          "demo choreography",
        ],
      },
      {
        relativePath: "state/artifacts/demo/metrics.json",
        minLength: 200,
        validator: ensureMetrics,
      },
      {
        relativePath: "state/artifacts/demo/performance_report.md",
        minLength: 700,
        mustContain: ["TTFB", "LCP", "CLS", "performance budget", "fallback"],
      },
    ]);

    if (
      outcome.missing.length ||
      outcome.tooShort.length ||
      outcome.missingTokens.length ||
      outcome.validatorFailures.length
    ) {
      return this.fail(
        "Demo conversion assets are not production ready.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass("Demo conversion assets look fantastic.", outcome.details);
  }
}
