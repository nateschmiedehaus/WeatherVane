import path from "node:path";
import { defineConfig } from "vitest/config";

const testsRoot = path.resolve(__dirname, "..", "..", "tests", "web").replace(/\\/g, "/");
const libTestsRoot = path.resolve(__dirname, "src", "lib", "__tests__").replace(/\\/g, "/");
const componentTestsRoot = path.resolve(__dirname, "src", "components", "__tests__").replace(/\\/g, "/");
const pageTestsRoot = path.resolve(__dirname, "src", "pages", "__tests__").replace(/\\/g, "/");

export default defineConfig({
  root: __dirname,
  test: {
    environment: "jsdom",
    include: [
      `${testsRoot}/**/*.spec.ts`,
      `${libTestsRoot}/**/*.test.ts`,
      `${componentTestsRoot}/**/*.test.tsx`,
      `${pageTestsRoot}/**/*.test.tsx`,
    ],
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  server: {
    fs: {
      allow: [__dirname, path.resolve(__dirname, "..", "..")],
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "src"),
      "react-dom/test-utils": path.resolve(__dirname, "node_modules", "react-dom", "test-utils.js"),
      "react-dom/client": path.resolve(__dirname, "node_modules", "react-dom", "client.js"),
    },
  },
});
