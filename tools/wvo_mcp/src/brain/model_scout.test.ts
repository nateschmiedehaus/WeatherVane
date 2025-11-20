import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { loadCandidates } from "./model_scout";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  delete process.env.WVO_SCOUT_SOURCE;
});

function writeCache(data: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scout-cache-"));
  cleanup.push(dir);
  const file = path.join(dir, "cache.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  return file;
}

describe("model_scout loadCandidates", () => {
  it("loads candidates from cached source when valid", () => {
    const file = writeCache([
      {
        provider: "gemini",
        id: "gemini-x",
        observedAt: "2025-11-20T00:00:00Z",
        context: 16000,
        lane: "fast",
        capabilities: { coding: true },
      },
    ]);
    process.env.WVO_SCOUT_SOURCE = file;
    const candidates = loadCandidates();
    expect(candidates[0]?.id).toBe("gemini-x");
    expect(candidates[0]?.provider).toBe("gemini");
  });

  it("falls back to stubs when cache invalid", () => {
    const file = writeCache([{ provider: "gemini", id: "", observedAt: "", context: 0, lane: "fast" }]);
    process.env.WVO_SCOUT_SOURCE = file;
    const candidates = loadCandidates();
    expect(candidates.length).toBeGreaterThan(0);
  });
});
