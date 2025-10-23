#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exit } from "node:process";
import { execa } from "execa";

const TEST_BASE = "tests/test_allocator.py";
const TEST_MEDIUM = [
  TEST_BASE,
  "tests/test_allocator_routes.py",
  "tests/test_creative_route.py",
  "tests/apps/model/test_creative_response.py",
];
const TEST_HIGH = [
  "tests/test_allocator_stress.py",
  "tests/apps/test_allocator_rollback_executor.py",
];
const PYTEST_COMMON_ARGS = ["--maxfail=1"];

function normalizeProfile(input) {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "low" || value === "high") {
    return value;
  }
  return "medium";
}

function buildCommandPlan(profile) {
  if (profile === "low") {
    return [
      {
        cmd: "pytest",
        args: [...PYTEST_COMMON_ARGS, TEST_BASE],
      },
    ];
  }

  const mediumSuite = [...PYTEST_COMMON_ARGS, ...TEST_MEDIUM];
  if (profile === "medium") {
    return [
      {
        cmd: "pytest",
        args: mediumSuite,
      },
    ];
  }

  return [
    {
      cmd: "pytest",
      args: mediumSuite,
    },
    {
      cmd: "pytest",
      args: [...PYTEST_COMMON_ARGS, ...TEST_HIGH],
    },
  ];
}

function buildPythonPath(workspaceRoot, existing) {
  const segments = new Set();
  if (existing) {
    String(existing)
      .split(path.delimiter)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .forEach((segment) => segments.add(segment));
  }

  segments.add(workspaceRoot);
  const depsPath = path.join(workspaceRoot, ".deps");
  if (fs.existsSync(depsPath)) {
    segments.add(depsPath);
  }

  return Array.from(segments).join(path.delimiter);
}

async function runAllocatorSuite(profileInput, options = {}) {
  const profile = normalizeProfile(profileInput);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const spawn = options.spawn ?? execa;
  const environment = { ...(options.env ?? process.env) };
  environment.PYTHONPATH = buildPythonPath(workspaceRoot, environment.PYTHONPATH);

  const plan = buildCommandPlan(profile);
  for (const command of plan) {
    try {
      const subprocess = spawn(command.cmd, command.args, {
        stdio: "inherit",
        preferLocal: true,
        env: environment,
        cwd: workspaceRoot,
      });
      const { exitCode } = await subprocess;
      if ((exitCode ?? 0) !== 0) {
        return exitCode ?? 1;
      }
    } catch (error) {
      if (error && typeof error.exitCode === "number") {
        return error.exitCode;
      }
      console.error("[run_allocator_checks] unexpected failure", error);
      return 1;
    }
  }

  return 0;
}

async function main(argv = process.argv) {
  const requestedProfile = (argv?.[2] ?? "").trim();
  return runAllocatorSuite(requestedProfile);
}

const isExecutedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  const exitCode = await main();
  exit(exitCode);
}

export { buildCommandPlan, buildPythonPath, main, normalizeProfile, runAllocatorSuite };
