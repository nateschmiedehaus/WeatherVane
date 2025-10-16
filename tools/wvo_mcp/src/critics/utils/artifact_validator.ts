import fs from "node:fs/promises";
import path from "node:path";

export interface ArtifactRequirement {
  /**
   * Path relative to the workspace root (e.g. "state/artifacts/demo/demo_plan.md").
   */
  relativePath: string;
  /**
   * Minimum number of characters the file must contain.
   */
  minLength?: number;
  /**
   * Ensure the file contains each token at least once (case insensitive).
   */
  mustContain?: string[];
  /**
   * Optional validator executed on file contents.
   */
  validator?: (content: string) => void;
}

export interface ArtifactValidationOutcome {
  missing: string[];
  tooShort: Array<{ path: string; length: number; required: number }>;
  missingTokens: Array<{ path: string; tokens: string[] }>;
  validatorFailures: Array<{ path: string; message: string }>;
  details: string[];
}

export async function validateArtifacts(
  workspace: string,
  requirements: ArtifactRequirement[],
): Promise<ArtifactValidationOutcome> {
  const outcome: ArtifactValidationOutcome = {
    missing: [],
    tooShort: [],
    missingTokens: [],
    validatorFailures: [],
    details: [],
  };

  for (const requirement of requirements) {
    const absolutePath = path.join(workspace, requirement.relativePath);

    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      outcome.missing.push(requirement.relativePath);
      outcome.details.push(
        `Missing artifact: ${requirement.relativePath}`,
      );
      continue;
    }

    const trimmed = content.trim();

    if (requirement.minLength && trimmed.length < requirement.minLength) {
      outcome.tooShort.push({
        path: requirement.relativePath,
        length: trimmed.length,
        required: requirement.minLength,
      });
      outcome.details.push(
        `Artifact too short: ${requirement.relativePath} (${trimmed.length}/${requirement.minLength} chars)`,
      );
    }

    if (requirement.mustContain && requirement.mustContain.length > 0) {
      const lower = trimmed.toLowerCase();
      const missingTokens = requirement.mustContain.filter(
        (token) => !lower.includes(token.toLowerCase()),
      );
      if (missingTokens.length > 0) {
        outcome.missingTokens.push({
          path: requirement.relativePath,
          tokens: missingTokens,
        });
        outcome.details.push(
          `Artifact ${requirement.relativePath} missing required phrases: ${missingTokens.join(
            ", ",
          )}`,
        );
      }
    }

    if (requirement.validator) {
      try {
        requirement.validator(trimmed);
      } catch (error) {
        outcome.validatorFailures.push({
          path: requirement.relativePath,
          message:
            error instanceof Error ? error.message : String(error),
        });
        outcome.details.push(
          `Validator failed for ${requirement.relativePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return outcome;
}

export function buildFailureMessage(outcome: ArtifactValidationOutcome): string {
  const sections: string[] = [];
  if (outcome.missing.length > 0) {
    sections.push(`Missing artifacts: ${outcome.missing.join(", ")}`);
  }
  if (outcome.tooShort.length > 0) {
    const lines = outcome.tooShort.map(
      (entry) =>
        `${entry.path} (${entry.length}/${entry.required} chars)`,
    );
    sections.push(`Artifacts below minimum length: ${lines.join(", ")}`);
  }
  if (outcome.missingTokens.length > 0) {
    const lines = outcome.missingTokens.map(
      (entry) => `${entry.path} -> ${entry.tokens.join(", ")}`,
    );
    sections.push(`Artifacts missing required concepts: ${lines.join("; ")}`);
  }
  if (outcome.validatorFailures.length > 0) {
    const lines = outcome.validatorFailures.map(
      (entry) => `${entry.path}: ${entry.message}`,
    );
    sections.push(`Validation failures: ${lines.join("; ")}`);
  }
  return sections.join(" | ");
}
