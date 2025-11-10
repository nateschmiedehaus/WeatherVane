#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function listSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (!/[.](ts|tsx|js|jsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function writeLocalKb(dir) {
  const files = listSourceFiles(dir);
  const entries = files.map((file) => {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    return {
      file: rel,
      sha256: hashContent(content),
      lines: content.split(/\r?\n/).length,
    };
  });
  const payload = {
    generated_at: new Date().toISOString(),
    source_dir: path.relative(process.cwd(), dir) || ".",
    entries,
  };
  const target = path.join(dir, "LOCAL_KB.yaml");
  const yamlBody = [
    `generated_at: ${payload.generated_at}`,
    `source_dir: ${payload.source_dir}`,
    "entries:",
    ...entries.map((entry) =>
      [
        "  - file: " + entry.file,
        "    sha256: " + entry.sha256,
        "    lines: " + entry.lines,
      ].join("\n"),
    ),
  ].join("\n");
  fs.writeFileSync(target, `${yamlBody}\n`, "utf8");
  console.log(`Wrote ${target}`);
}

const dirsArgIndex = process.argv.indexOf("--dirs");
if (dirsArgIndex === -1 || !process.argv[dirsArgIndex + 1]) {
  console.error("Usage: lkl_gen.mjs --dirs <dir1,dir2,...>");
  process.exit(1);
}
const inputDirs = process.argv[dirsArgIndex + 1]
  .split(",")
  .map((dir) => dir.trim())
  .filter(Boolean);

for (const dir of inputDirs) {
  const absolute = path.resolve(dir);
  if (!fs.existsSync(absolute)) {
    console.error(`Directory not found: ${dir}`);
    process.exitCode = 1;
    continue;
  }
  writeLocalKb(absolute);
}
