import { describe, it, expect } from "vitest";
import { mergeCandidates, type ModelCandidate } from "./model_registry_merge";
import type { ModelRegistryData } from "./model_registry";

const baseRegistry: ModelRegistryData = {
  last_updated: "2025-01-01T00:00:00Z",
  ttl_hours: 24,
  providers: {
    claude: {
      access_method: "api",
      last_checked: "2025-01-01T00:00:00Z",
      models: [
        {
          id: "claude-haiku-latest",
          name: "Claude Haiku (latest)",
          context_window: 200000,
          max_output: 8192,
          cost_per_mtok: { input: 1.0, output: 5.0 },
          capabilities: ["coding", "fast"],
          capability_tags: { speed: true, balanced: true, context: 200000 },
          available: true,
          subscription_tier: "team",
          last_checked: "2025-01-01T00:00:00Z",
        },
      ],
    },
  },
};

describe("model_registry_merge", () => {
  it("adds new provider entry", () => {
    const candidates: ModelCandidate[] = [
      {
        provider: "gemini",
        id: "gemini-2.0-flash-exp",
        observedAt: "2025-11-20T00:00:00Z",
        contextWindow: 128000,
        capabilities: ["fast", "coding"],
      },
    ];
    const merged = mergeCandidates(baseRegistry, candidates);
    expect(merged.providers.gemini?.models[0].id).toBe("gemini-2.0-flash-exp");
    expect(merged.providers.gemini?.models[0].context_window).toBe(128000);
  });

  it("updates existing entry only when newer", () => {
    const candidates: ModelCandidate[] = [
      {
        provider: "claude",
        id: "claude-haiku-latest",
        observedAt: "2025-11-20T00:00:00Z",
        contextWindow: 250000,
        capabilities: ["coding", "fast", "vision"],
        capabilityTags: undefined,
      },
      {
        provider: "claude",
        id: "claude-haiku-latest",
        observedAt: "2024-12-31T00:00:00Z", // older, should be skipped
        contextWindow: 1,
      },
    ];
    const merged = mergeCandidates(baseRegistry, candidates);
    const entry = merged.providers.claude?.models.find((m) => m.id === "claude-haiku-latest");
    expect(entry?.context_window).toBe(250000);
    expect(entry?.capability_tags).toBeDefined();
  });

  it("skips invalid candidates", () => {
    const candidates: ModelCandidate[] = [
      { provider: "claude", id: "", observedAt: "2025-11-20T00:00:00Z" } as any,
    ];
    const merged = mergeCandidates(baseRegistry, candidates);
    expect(merged.providers.claude?.models.length).toBe(1);
  });
});
