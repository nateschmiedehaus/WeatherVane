#!/usr/bin/env node
import { exit } from "node:process";
import { execa } from "execa";

const allowedProfiles = new Set(["low", "medium", "high"]);
const requestedProfile = (process.argv[2] ?? "").trim().toLowerCase();
const profile = allowedProfiles.has(requestedProfile) ? requestedProfile : "medium";

const commands = [];

if (profile === "medium" || profile === "high") {
  commands.push({ cmd: "make", args: ["lint"] });
}

if (profile === "high") {
  commands.push({ cmd: "make", args: ["test"] });
}

async function run() {
  try {
    for (const { cmd, args } of commands) {
      const subprocess = execa(cmd, args, {
        stdio: "inherit",
        preferLocal: true,
      });
      const { exitCode } = await subprocess;
      if ((exitCode ?? 0) !== 0) {
        exit(exitCode ?? 1);
      }
    }
    exit(0);
  } catch (error) {
    if (typeof error?.exitCode === "number") {
      exit(error.exitCode);
    }
    console.error("[run_health_check] unexpected failure", error);
    exit(1);
  }
}

await run();
