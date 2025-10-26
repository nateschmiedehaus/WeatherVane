import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { QNA_SOURCES } from "../atlas_sources.js";
import { AtlasService } from "../atlas_service.js";

const workspaceRoot = process.cwd();

async function readPointer(pointer: string): Promise<string> {
  const [relPath] = pointer.split("#");
  const absPath = path.join(workspaceRoot, relPath);
  return fs.readFile(absPath, "utf-8");
}

describe("Atlas Q/A smoke", () => {
  it("answers all predefined questions via pointers", async () => {
    for (const question of QNA_SOURCES) {
      const content = await readPointer(question.pointer);
      expect(content.toLowerCase()).toContain(question.expectation.toLowerCase());
    }
  });

  it("reports question metadata via AtlasService", async () => {
    const service = new AtlasService(workspaceRoot);
    const payload = await service.answerQuestions();
    expect(payload.total).toBe(QNA_SOURCES.length);
    expect(payload.answered).toBe(QNA_SOURCES.length);
  });
});
