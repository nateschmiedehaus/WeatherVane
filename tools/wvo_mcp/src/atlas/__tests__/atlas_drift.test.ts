import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { validateAtlas } from "../validate_atlas.js";

const manifestJsonPath = path.join(process.cwd(), "docs/autopilot/MANIFEST.json");

describe.sequential("Atlas drift guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects manifest drift", async () => {
    const original = await fs.readFile(manifestJsonPath, "utf-8");
    const mutated = JSON.parse(original);
    mutated.prompts[0].sha256 = "deadbeef";

    const realReadFile = fs.readFile.bind(fs);
    let serveMutated = true;
    vi.spyOn(fs, "readFile").mockImplementation(async (file, options) => {
      const targetPath = typeof file === "string" ? file : file.toString();
      if (serveMutated && targetPath === manifestJsonPath) {
        serveMutated = false;
        return JSON.stringify(mutated, null, 2);
      }
      return realReadFile(file as never, options as never);
    });

    await expect(validateAtlas()).rejects.toThrow(/Prompt hash drift/);
    await expect(validateAtlas()).resolves.not.toThrow();
  });
});
