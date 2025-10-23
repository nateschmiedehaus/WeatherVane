#!/usr/bin/env node
import { exit } from "node:process";
import { execa } from "execa";

const profile = (process.argv[2] ?? "").toLowerCase();

const testCommands = [
  {
    cmd: "npm",
    args: ["--prefix", "apps/web", "run", "test", "--", "--run", "tests/web/executive_review.spec.ts"],
  },
];

if (profile === "high") {
  testCommands.push({
    cmd: "npm",
    args: ["--prefix", "apps/web", "run", "test", "--", "--run", "tests/web/automation_trust.spec.ts"],
  });
}

try {
  for (const command of testCommands) {
    const subprocess = execa(command.cmd, command.args, {
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
  if (error?.exitCode !== undefined) {
    exit(error.exitCode);
  }
  console.error("[run_exec_review_checks] unexpected failure", error);
  exit(1);
}
