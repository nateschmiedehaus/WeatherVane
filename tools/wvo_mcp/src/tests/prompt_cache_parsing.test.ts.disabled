import { describe, expect, it } from "vitest";

import { parsePromptCacheMetadata } from "../orchestrator/agent_pool.js";

describe("parsePromptCacheMetadata", () => {
  it("detects cache hit with tier and id", () => {
    const sample = `
Cache status: HIT
Cache-Tier: prompt
Cache-ID: abc123
`;
    const metadata = parsePromptCacheMetadata(sample);
    expect(metadata).toBeDefined();
    expect(metadata?.status).toBe("hit");
    expect(metadata?.tier).toBe("prompt");
    expect(metadata?.cacheId).toBe("abc123");
  });

  it("detects cache store events", () => {
    const sample = `
Prompt cache: miss (storing)
Cache tier: prompt
`;
    const metadata = parsePromptCacheMetadata(sample);
    expect(metadata).toBeDefined();
    expect(metadata?.status).toBe("store");
    expect(metadata?.tier).toBe("prompt");
  });

  it("returns undefined when no cache signal present", () => {
    const sample = `
Usage: prompt tokens=123, completion tokens=45
Cost USD: 0.0123
`;
    const metadata = parsePromptCacheMetadata(sample);
    expect(metadata).toBeUndefined();
  });
});
