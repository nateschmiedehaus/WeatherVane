import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { InspirationFetcher } from "../web_tools/inspiration_fetcher.js";

const workspaceRoot = mkdtempSync(path.join(tmpdir(), "wvo-web-inspiration-test-"));

describe("InspirationFetcher", () => {
  it("rejects disallowed domains", async () => {
    const fetcher = new InspirationFetcher(workspaceRoot);
    const result = await fetcher.capture({ url: "https://example.com" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("allow-list");
  });

  it("guides installation when Playwright is missing", async () => {
    const fetcher = new InspirationFetcher(workspaceRoot);
    const result = await fetcher.capture({ url: "https://www.awwwards.com" });
    if (result.success) {
      // Environment already has Playwright + Chromium installed; ensure metadata looks sane.
      expect(result.screenshotPath).toBeDefined();
    } else {
      expect(result.error).toMatch(/Playwright not installed|Failed to launch Playwright chromium browser|Timeout/);
    }
  }, 15000);
});
