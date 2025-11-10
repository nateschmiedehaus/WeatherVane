#!/usr/bin/env node
import process from "node:process";

const target = process.argv[2] ?? "safety/AFP-W0-STEP5-MUTATION/stage-7-pre";
const defaultBranch = process.env.DEFAULT_BRANCH || "origin/main";

const plan = [
  `git fetch origin`,
  `git checkout ${defaultBranch.replace('origin/', '')}`,
  `git reset --hard ${target}`,
  `git push --force-with-lease origin ${defaultBranch.replace('origin/', '')}`,
];

console.log(`# rollback dry-run for target: ${target}`);
for (const cmd of plan) {
  console.log(cmd);
}
