import path from "node:path";
import { defineConfig } from "vitest/config";

const testsRoot = path.resolve(__dirname, "..", "..", "tests", "web").replace(/\\/g, "/");

export default defineConfig({
  root: __dirname,
  test: {
    environment: "node",
    include: [`${testsRoot}/**/*.spec.ts`],
    globals: true,
  },
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "src"),
    },
  },
});
