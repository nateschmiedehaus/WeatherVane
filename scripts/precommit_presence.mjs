#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "state/logs/.gitkeep",
  "state/evidence/README.md",
  "state/config/drqc.json"
];
const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
if (missing.length > 0) {
  console.error("Presence check failed. Missing required evidence artifacts:\n" + missing.join("\n"));
  process.exit(1);
}
console.log("Presence check passed");
