import { describe, expect, it } from "vitest";

import { HealthCheckCritic } from "./health_check.js";

describe("HealthCheckCritic command selection", () => {
  it("skips execution for low profile", () => {
    const critic = new HealthCheckCritic("/tmp");
    expect((critic as unknown as { command(input: string): string | null }).command("low")).toBeNull();
    expect((critic as unknown as { command(input: string): string | null }).command(" LOW ")).toBeNull();
  });

  it("invokes runner with medium profile", () => {
    const critic = new HealthCheckCritic("/tmp");
    const command = (critic as unknown as { command(input: string): string | null }).command("medium");
    expect(command).toBe("node tools/wvo_mcp/scripts/run_health_check.mjs medium");
  });

  it("invokes runner with high profile", () => {
    const critic = new HealthCheckCritic("/tmp");
    const command = (critic as unknown as { command(input: string): string | null }).command("HIGH");
    expect(command).toBe("node tools/wvo_mcp/scripts/run_health_check.mjs high");
  });

  it("falls back to default runner when profile missing", () => {
    const critic = new HealthCheckCritic("/tmp");
    const command = (critic as unknown as { command(input: string): string | null }).command("   ");
    expect(command).toBe("node tools/wvo_mcp/scripts/run_health_check.mjs");
  });
});
