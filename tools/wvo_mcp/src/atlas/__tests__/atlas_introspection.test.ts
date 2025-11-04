import { describe, expect, it } from "vitest";

import { AtlasService } from "../atlas_service.js";
import { validateAtlas } from "../validate_atlas.js";

const service = new AtlasService(process.cwd());

describe("Atlas introspection endpoints", () => {
  it("describes the mission and components", async () => {
    const payload = await service.describe();
    expect(payload.mission).toMatch(/Autopilot/i);
    expect(Array.isArray(payload.components)).toBe(true);
    expect((payload.components as string[]).length).toBeGreaterThan(3);
  });

  it("lists tools including self_describe", async () => {
    const payload = await service.listTools();
    const names = (payload.tools as Array<{ name: string }>).map((tool) => tool.name);
    expect(names).toContain("self_describe");
    expect(names).toContain("plan_next");
  });

  it("returns schema metadata", async () => {
    const payload = await service.getSchema("lcp");
    expect(payload.schema).toHaveProperty("title", "Local Context Pack");
  });

  it("returns prompt content with attested hash", async () => {
    const payload = await service.getPrompt("dod_pr");
    expect(payload).toHaveProperty("content");
    expect((payload.content as string)).toMatch(/Definition of Done/i);
  });

  it("provides the briefing pack including attestation", async () => {
    const pack = await service.getBriefingPack();
    expect(pack).toHaveProperty("hash");
    expect(pack).toHaveProperty(["attestation", "manifest_sha"]);
  });

  it("passes the atlas validator", async () => {
    await expect(validateAtlas()).resolves.not.toThrow();
  });
});
