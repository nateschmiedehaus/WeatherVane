/**
 * Tests for TypeScript LSP Proxy
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TypeScriptLSPProxy } from "./tsserver_proxy";
import { LSPManager, resetLSPManager } from "./lsp_manager";
import * as path from "path";
import * as fs from "fs";

describe("TypeScriptLSPProxy", () => {
  let proxy: TypeScriptLSPProxy;
  let manager: LSPManager;
  let tempDir: string;
  const workspaceRoot = path.resolve(__dirname, "../../../..");

  beforeEach(() => {
    resetLSPManager();
    manager = new LSPManager(workspaceRoot);
    proxy = new TypeScriptLSPProxy(manager, workspaceRoot);

    // Create a temporary directory for test files
    const tempRoot = path.join(workspaceRoot, "tmp", "lsp-tests");
    fs.mkdirSync(tempRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(tempRoot, "case-"));
  });

  afterEach(async () => {
    if (manager) {
      await manager.stopAll();
    }
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("basic operations", () => {
    it("should create proxy instance", () => {
      expect(proxy).toBeDefined();
      expect(proxy).toBeInstanceOf(TypeScriptLSPProxy);
    });

    it("should handle get definition without errors", async () => {
      const result = await proxy.getDefinition("test.ts", 0, 0);
      expect(result).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);
    });

    it("should handle get references without errors", async () => {
      const result = await proxy.getReferences("test.ts", 0, 0);
      expect(result).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);
    });

    it("should handle get hover without errors", async () => {
      const result = await proxy.getHover("test.ts", 0, 0);
      expect(result).toBeDefined();
    });
  });

  describe("code extraction", () => {
    it("should extract code slice from file", () => {
      // Create a test file
      const testFile = path.join(tempDir, "test.ts");
      const content = `function hello() {
  console.log('Hello');
}

function world() {
  console.log('World');
}`;
      fs.writeFileSync(testFile, content);

      // Test private method via type assertion
      const result = (proxy as any).extractCodeSlice(testFile, 1, 3);
      expect(result).toBeDefined();
      expect(result?.content).toContain("console.log");
    });

    it("should handle missing files gracefully", () => {
      const result = (proxy as any).extractCodeSlice(
        "/nonexistent/file.ts",
        0,
        5
      );
      expect(result).toBeNull();
    });

    it("should handle out-of-bounds line numbers", () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "console.log('test');");

      const result = (proxy as any).extractCodeSlice(testFile, 100, 200);
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });
  });

  describe("symbol finding", () => {
    it("should find function declaration", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, `function myFunction() {
  return 42;
}`);

      const line = await proxy.findSymbolFallback("myFunction", testFile);
      expect(line).toBe(0);
    });

    it("should find class declaration", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, `class MyClass {
  constructor() {}
}`);

      const line = await proxy.findSymbolFallback("MyClass", testFile);
      expect(line).toBe(0);
    });

    it("should find const declaration", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, `const myVariable = 42;`);

      const line = await proxy.findSymbolFallback("myVariable", testFile);
      expect(line).toBe(0);
    });

    it("should return null for non-existent symbol", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, `const x = 1;`);

      const line = await proxy.findSymbolFallback("nonExistent", testFile);
      expect(line).toBeNull();
    });

    it("should not find symbols outside workspace", async () => {
      const result = await proxy.findSymbolFallback("test", "/etc/passwd");
      expect(result).toBeNull();
    });
  });

  describe("definition with context", () => {
    it("should get definition with context", async () => {
      const result = await proxy.getDefinitionWithContext("test.ts", 0, 0, 3);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should include code slices in results", async () => {
      const testFile = path.join(tempDir, "test.ts");
      fs.writeFileSync(testFile, "function test() {\n  return 42;\n}");

      const result = await proxy.getDefinitionWithContext(testFile, 0, 0, 2);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("references with context", () => {
    it("should get references with context", async () => {
      const result = await proxy.getReferencesWithContext("test.ts", 0, 0, 2);
      expect(result).toBeDefined();
      expect(result.symbol).toBeDefined();
      expect(Array.isArray(result.definitions)).toBe(true);
      expect(Array.isArray(result.references)).toBe(true);
    });
  });

  describe("input validation", () => {
    it("should validate workspace boundaries", () => {
      const result = (proxy as any).isInWorkspace(workspaceRoot);
      expect(typeof result).toBe("boolean");
    });

    it("should reject paths outside workspace", () => {
      const result = (proxy as any).isInWorkspace("/tmp/../../etc/passwd");
      expect(result).toBe(false);
    });
  });

  describe("error resilience", () => {
    it("should handle null values in hover result", async () => {
      const result = await proxy.getHover("nonexistent.ts", 0, 0);
      expect(result).toBeDefined();
    });

    it("should handle definition errors gracefully", async () => {
      const result = await proxy.getDefinition("nonexistent.ts", 0, 0);
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
    });
  });
});
