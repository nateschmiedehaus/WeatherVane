import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "..", "..");

function createStubCodex(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const codexPath = path.join(binDir, "codex");
  const script = `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  status)
    echo "Logged in as smoke-tester"
    exit 0
    ;;
  mcp)
    exit 0
    ;;
  login)
    echo "Codex login stub"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`;
  writeFileSync(codexPath, script, "utf8");
  chmodSync(codexPath, 0o755);
}

function seedWorkspace(): { workspace: string; scriptPath: string } {
  const workspace = mkdtempSync(path.join(tmpdir(), "wvo-autopilot-smoke-"));

  const toolsDir = path.join(workspace, "tools", "wvo_mcp");
  const scriptsDir = path.join(toolsDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });

  const distDir = path.join(toolsDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, "index-claude.js"), "export default () => {}", "utf8");

  const nodeModulesDir = path.join(toolsDir, "node_modules");
  mkdirSync(nodeModulesDir, { recursive: true });

  const docsDir = path.join(workspace, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(path.join(docsDir, "wvo_prompt.md"), "# Smoke Prompt\n", "utf8");

  const stateDir = path.join(workspace, "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    path.join(stateDir, "accounts.yaml"),
    `codex:
  - id: codex_smoke
    profile: smoke_profile
claude: []
`,
    "utf8",
  );

  const autopilotSource = path.join(packageRoot, "scripts", "autopilot.sh");
  const autopilotDest = path.join(scriptsDir, "autopilot.sh");
  copyFileSync(autopilotSource, autopilotDest);
  chmodSync(autopilotDest, 0o755);

  const configureSource = path.join(packageRoot, "scripts", "configure_codex_profile.py");
  const configureDest = path.join(scriptsDir, "configure_codex_profile.py");
  copyFileSync(configureSource, configureDest);
  chmodSync(configureDest, 0o755);

  const accountManagerSource = path.join(packageRoot, "scripts", "account_manager.py");
  const accountManagerDest = path.join(scriptsDir, "account_manager.py");
  copyFileSync(accountManagerSource, accountManagerDest);
  chmodSync(accountManagerDest, 0o755);

  return { workspace, scriptPath: autopilotDest };
}

describe("autopilot smoke mode", () => {
  it("completes without invoking real providers", async () => {
    const { workspace, scriptPath } = seedWorkspace();
    const binDir = path.join(workspace, "bin");
    createStubCodex(binDir);

    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      WVO_AUTOPILOT_SMOKE: "1",
      ENABLE_CLAUDE_EVAL: "0",
      LOG_FILE: path.join(workspace, "autopilot.log"),
    };

    const { stdout, exitCode } = await execa(scriptPath, {
      cwd: workspace,
      env,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Autopilot smoke check completed.");
  }, 20000);
});
