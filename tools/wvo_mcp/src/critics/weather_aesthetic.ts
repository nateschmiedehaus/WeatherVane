import { Critic, type CriticResult } from "./base.js";
import { validateArtifacts, buildFailureMessage } from "./utils/artifact_validator.js";

function ensureValidThemeJson(content: string): void {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.themes) || parsed.themes.length < 4) {
    throw new Error("themes array must include at least four weather states.");
  }
  if (!parsed.transitions || typeof parsed.transitions !== "object") {
    throw new Error("transitions map missing in themes.json.");
  }
}

function ensureScreenshotCatalog(content: string): void {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith("- "));
  if (lines.length < 6) {
    throw new Error(
      "Screenshot catalog must include at least six reference entries.",
    );
  }
}

export class WeatherAestheticCritic extends Critic {
  name = "weather_aesthetic";
  description =
    "Validates that weather-inspired visuals, palettes, and references are curated and current.";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(_profile: string): Promise<CriticResult> {
    const outcome = await validateArtifacts(this.workspaceRoot, [
      {
        relativePath: "state/artifacts/weather_aesthetic/themes.json",
        minLength: 500,
        validator: ensureValidThemeJson,
        mustContain: ["sunny", "rain", "snow", "storm"],
      },
      {
        relativePath:
          "state/artifacts/weather_aesthetic/screenshot_catalog.md",
        minLength: 600,
        validator: ensureScreenshotCatalog,
        mustContain: [
          "Framer",
          "Webflow",
          "Awwwards",
          "SiteInspire",
          "color palette",
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
        "Weather aesthetic references are incomplete.",
        buildFailureMessage(outcome),
      );
    }

    return this.pass(
      "Weather aesthetic catalogue meets inspiration standards.",
      outcome.details,
    );
  }
}
