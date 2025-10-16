#!/usr/bin/env node

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));

function needsRebuild(error) {
  if (!error) return false;
  if (error.code === "MODULE_NOT_FOUND") return true;
  const message = typeof error.message === "string" ? error.message : "";
  return message.includes("NODE_MODULE_VERSION") || message.includes("was compiled against a different Node.js version");
}

const force = process.env.FORCE_SQLITE_REBUILD === "1";

if (!force) {
  try {
    await import("better-sqlite3");
    process.exit(0);
  } catch (error) {
    if (!needsRebuild(error)) {
      throw error;
    }
  }
}

const sdkPath = execSync("xcrun --show-sdk-path", { encoding: "utf8" }).trim();
const env = {
  ...process.env,
  CXXFLAGS: `-isysroot ${sdkPath} -I${sdkPath}/usr/include/c++/v1`,
};

console.info("[sqlite] Rebuilding better-sqlite3 for current Node runtime…");
execSync("npm rebuild better-sqlite3", {
  cwd,
  stdio: "inherit",
  env,
});
