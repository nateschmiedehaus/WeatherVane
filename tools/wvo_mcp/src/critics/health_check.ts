import { Critic } from "./base.js";

const RUNNER_COMMAND = "node tools/wvo_mcp/scripts/run_health_check.mjs";

export class HealthCheckCritic extends Critic {
  protected command(profile: string): string | null {
    const trimmedProfile = (profile ?? "").trim().toLowerCase();
    if (trimmedProfile === "low") {
      return null;
    }
    if (trimmedProfile.length > 0) {
      return `${RUNNER_COMMAND} ${trimmedProfile}`;
    }
    return RUNNER_COMMAND;
  }
}
