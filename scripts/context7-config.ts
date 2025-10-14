import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config/api-docs.json");
const data = readFileSync(configPath, "utf-8");
const outPath = path.join(root, "docs/api/sources.json");

await Bun.write(outPath, data);
