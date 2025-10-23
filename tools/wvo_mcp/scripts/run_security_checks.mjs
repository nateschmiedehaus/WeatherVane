#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { exit } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { execa } from "execa";

const PRIMARY_COMMAND = { cmd: "make", args: ["security"] };
const FALLBACK_COMMAND = { cmd: "python", args: ["tools/security/run_security_checks.py", "--json"] };

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");

function looksLikeWorkspaceRoot(directory) {
  try {
    const securityScript = path.join(directory, "tools", "security", "run_security_checks.py");
    if (fs.existsSync(securityScript)) {
      return true;
    }

    const makefilePath = path.join(directory, "Makefile");
    if (fs.existsSync(makefilePath)) {
      const content = fs.readFileSync(makefilePath, "utf8");
      if (/^security:/m.test(content)) {
        return true;
      }
    }

    if (fs.existsSync(path.join(directory, ".git"))) {
      return true;
    }
  } catch (error) {
    /* ignore: fall through to false */
  }
  return false;
}

function resolveWorkspaceRoot(explicitRoot) {
  if (explicitRoot) {
    const resolved = path.resolve(explicitRoot);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  const seen = new Set();
  const candidates = [
    process.env.WVO_WORKSPACE_ROOT,
    process.cwd(),
    DEFAULT_REPO_ROOT,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    if (looksLikeWorkspaceRoot(resolved)) {
      return resolved;
    }
  }

  return DEFAULT_REPO_ROOT;
}

async function runCommand(spawn, descriptor, options) {
  try {
    const subprocess = spawn(descriptor.cmd, descriptor.args, options);
    const { exitCode } = await subprocess;
    return { exitCode: exitCode ?? 0 };
  } catch (error) {
    if (error && typeof error.exitCode === "number") {
      return { exitCode: error.exitCode };
    }
    return { exitCode: 1, error };
  }
}

async function runSecurityChecks(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  const spawn = options.spawn ?? execa;
  const environment = { ...(options.env ?? process.env) };
  const runOptions = {
    stdio: "inherit",
    preferLocal: true,
    cwd: workspaceRoot,
    env: environment,
  };

  const primaryResult = await runCommand(spawn, PRIMARY_COMMAND, runOptions);
  if (primaryResult.error) {
    console.error("[run_security_checks] failed to start make security", primaryResult.error);
  }

  if (primaryResult.exitCode === 0) {
    return 0;
  }

  console.warn(
    `[run_security_checks] make security exited with code ${primaryResult.exitCode}; running Python fallback.`,
  );

  const fallbackResult = await runCommand(spawn, FALLBACK_COMMAND, runOptions);
  if (fallbackResult.error) {
    console.error("[run_security_checks] failed to start Python fallback", fallbackResult.error);
  }

  if (fallbackResult.exitCode !== 0) {
    console.error(`[run_security_checks] Python fallback exited with code ${fallbackResult.exitCode}.`);
  }

  return fallbackResult.exitCode;
}

async function main() {
  return runSecurityChecks();
}

const isExecutedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  const exitCode = await main();
  exit(exitCode);
}

export { FALLBACK_COMMAND, PRIMARY_COMMAND, runCommand, runSecurityChecks, main };
