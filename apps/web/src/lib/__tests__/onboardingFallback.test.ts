import { describe, expect, it } from "vitest";

import { describeOnboardingFallback } from "../onboardingFallback";

describe("describeOnboardingFallback", () => {
  it("returns caution copy when live telemetry is still syncing", () => {
    const copy = describeOnboardingFallback("live_progress_unavailable");

    expect(copy.tone).toBe("caution");
    expect(copy.title).toMatch(/live telemetry/i);
    expect(copy.summary).toMatch(/demo proof/i);
    expect(copy.action).toMatch(/connector setup/i);
    expect(copy.scoreCap).toBeLessThanOrEqual(65);
  });

  it("surfaces retry guidance when the API returns a client error", () => {
    const copy = describeOnboardingFallback("client_error");

    expect(copy.tone).toBe("caution");
    expect(copy.summary).toMatch(/returned an error/i);
    expect(copy.action).toMatch(/api/i);
    expect(copy.scoreCap).toBeLessThanOrEqual(60);
  });

  it("falls back to a generic info message for unknown reasons", () => {
    const copy = describeOnboardingFallback("unknown_reason");

    expect(copy.tone).toBe("info");
    expect(copy.title).toMatch(/telemetry/i);
    expect(copy.summary).toMatch(/demo proof/i);
    expect(copy.scoreCap).toBeGreaterThan(60);
  });
});

