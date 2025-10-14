import { describe, expect, it } from "vitest";

const guardrail = await import("../../scripts/check_failover_guardrail.mjs");

const { analyzeFailoverSamples, evaluateFailoverGuardrail, formatDuration } = guardrail;

function sample(timestampMs: number, type: "claude_code" | "codex", available = true) {
  return { timestamp: timestampMs, type, available };
}

describe("coordinator failover guardrail analysis", () => {
  const base = Date.UTC(2025, 9, 12, 12, 0, 0);

  it("passes when Claude remains primary and telemetry is fresh", () => {
    const samples = [
      sample(base - 25 * 60 * 1000, "claude_code"),
      sample(base - 10 * 60 * 1000, "codex"),
      sample(base - 5 * 60 * 1000, "claude_code"),
      sample(base - 60 * 1000, "claude_code"),
    ];
    const analysis = analyzeFailoverSamples(samples, base);
    const result = evaluateFailoverGuardrail(analysis);
    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(0);
    expect(analysis.codexShare).toBeGreaterThan(0);
    expect(analysis.codexShare).toBeLessThan(0.5);
  });

  it("fails when Codex handles the majority of the window", () => {
    const samples = [
      sample(base - 40 * 60 * 1000, "codex", false),
      sample(base - 20 * 60 * 1000, "codex", false),
      sample(base - 5 * 60 * 1000, "claude_code", true),
    ];
    const analysis = analyzeFailoverSamples(samples, base);
    const result = evaluateFailoverGuardrail(analysis);
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Codex handling"),
        expect.stringContaining("Claude reported unavailable"),
      ]),
    );
  });

  it("fails when telemetry is stale", () => {
    const samples = [
      sample(base - 60 * 60 * 1000, "claude_code"),
      sample(base - 55 * 60 * 1000, "claude_code"),
    ];
    const analysis = analyzeFailoverSamples(samples, base);
    const result = evaluateFailoverGuardrail(analysis);
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(
      expect.arrayContaining([expect.stringContaining("telemetry stale")]),
    );
  });

  it("formats durations into readable strings", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(30_000)).toBe("30s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_660_000)).toBe("1h 1m");
  });
});
