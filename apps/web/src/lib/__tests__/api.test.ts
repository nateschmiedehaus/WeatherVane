import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchOnboardingProgress } from "../api";
import type { OnboardingProgressResponse } from "../../types/onboarding";

describe("api onboarding progress", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("forwards abort signal to onboarding progress request", async () => {
    const response: OnboardingProgressResponse = {
      tenant_id: "tenant-123",
      mode: "demo",
      generated_at: new Date().toISOString(),
      connectors: [],
      audits: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await fetchOnboardingProgress("tenant-123", "demo", { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain("/onboarding/progress?");
    expect(url).toContain("tenant_id=tenant-123");
    expect(init?.signal).toBe(controller.signal);
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });
});
