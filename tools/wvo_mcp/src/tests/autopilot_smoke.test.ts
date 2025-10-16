import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createStubCodex,
  runAutopilotScript,
  seedAutopilotWorkspace,
} from "./helpers/autopilot";

describe("autopilot smoke mode", () => {
  it("completes without invoking real providers", async () => {
    const { workspace, scriptPath } = seedAutopilotWorkspace();
    const binDir = path.join(workspace, "bin");
    createStubCodex(binDir);

    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      WVO_AUTOPILOT_SMOKE: "1",
      ENABLE_CLAUDE_EVAL: "0",
      WVO_AUTOPILOT_SKIP_DNS_CHECK: "1",
      WVO_AUTOPILOT_SKIP_NETWORK_CHECK: "1",
      WVO_ENABLE_WEB_INSPIRATION: "0",
      LOG_FILE: path.join(workspace, "autopilot.log"),
    };

    const { exitCode } = await runAutopilotScript(scriptPath, {
      cwd: workspace,
      env,
      timeoutMs: 20_000,
    });

    expect(exitCode).toBe(0);
    const logContents = readFileSync(env.LOG_FILE, "utf8");
    expect(logContents).toContain("Autopilot smoke check completed.");
  }, 20000);
});
