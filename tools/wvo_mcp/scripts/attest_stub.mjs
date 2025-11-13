#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const taskFlag = process.argv.indexOf("--task");
if (taskFlag === -1 || !process.argv[taskFlag + 1]) {
  console.error("Usage: attest_stub.mjs --task <TASK-ID>");
  process.exit(1);
}
const taskId = process.argv[taskFlag + 1];
const stateRoot = process.env.WVO_STATE_ROOT || path.resolve("state");
const attestDir = path.join(stateRoot, "logs", taskId, "attest");
fs.mkdirSync(attestDir, { recursive: true });
const manifest = {
  task: taskId,
  generated_at: new Date().toISOString(),
  artifacts: [],
  notes: "Stub manifest generated locally; replace with in-toto attestations when available.",
};
const target = path.join(attestDir, "manifest.json");
fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${target}`);
