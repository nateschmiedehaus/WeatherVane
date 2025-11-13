#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const taskFlag = process.argv.indexOf("--task");
if (taskFlag === -1 || !process.argv[taskFlag + 1]) {
  console.error("Usage: prompt_safety_stub.mjs --task <TASK-ID>");
  process.exit(1);
}
const taskId = process.argv[taskFlag + 1];
const stateRoot = process.env.WVO_STATE_ROOT || path.resolve("state");
const safetyDir = path.join(stateRoot, "logs", taskId, "safety");
fs.mkdirSync(safetyDir, { recursive: true });
const report = {
  task: taskId,
  generated_at: new Date().toISOString(),
  promptfoo: { high_severity: 0, notes: "Stub run" },
  garak: { high_severity: 0, notes: "Stub run" },
  status: "record-only",
};
const target = path.join(safetyDir, "prompt_eval.json");
fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
console.log(`Wrote ${target}`);
