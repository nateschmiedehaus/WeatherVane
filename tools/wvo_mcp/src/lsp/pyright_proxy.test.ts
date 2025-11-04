/**
 * Tests for Python LSP Proxy (Pyright)
 */

import * as fs from "fs";
import * as path from "path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LSPManager, resetLSPManager } from "./lsp_manager";
import { PythonLSPProxy } from "./pyright_proxy";

describe("PythonLSPProxy", () => {
  let proxy: PythonLSPProxy;
  let manager: LSPManager;
  let tempDir: string;
  const workspaceRoot = path.resolve(__dirname, "../../../..");

  beforeEach(() => {
    resetLSPManager();
    manager = new LSPManager(workspaceRoot);
    proxy = new PythonLSPProxy(manager, workspaceRoot);

    // Create a temporary directory for test files
    const tempRoot = path.join(workspaceRoot, "tmp", "lsp-py-tests");
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
      expect(proxy).toBeInstanceOf(PythonLSPProxy);
    });

    it("should handle get definition without errors", async () => {
      const result = await proxy.getDefinition("test.py", 0, 0);
      expect(result).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);
    });

    it("should handle get references without errors", async () => {
      const result = await proxy.getReferences("test.py", 0, 0);
      expect(result).toBeDefined();
      expect(result.locations).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);
    });

    it("should handle get hover without errors", async () => {
      const result = await proxy.getHover("test.py", 0, 0);
      expect(result).toBeDefined();
    });
  });

  describe("code extraction", () => {
    it("should extract code slice from file", () => {
      // Create a test file
      const testFile = path.join(tempDir, "test.py");
      const content = `def hello():
    print('Hello')

def world():
    print('World')`;
      fs.writeFileSync(testFile, content);

      // Test private method via type assertion
      const result = (proxy as any).extractCodeSlice(testFile, 1, 3);
      expect(result).toBeDefined();
      expect(result?.content).toContain("print");
    });

    it("should handle missing files gracefully", () => {
      const result = (proxy as any).extractCodeSlice(
        "/nonexistent/file.py",
        0,
        5
      );
      expect(result).toBeNull();
    });

    it("should handle out-of-bounds line numbers", () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, "print('test')");

      const result = (proxy as any).extractCodeSlice(testFile, 100, 200);
      expect(result).toBeDefined();
      expect(result?.content).toBeDefined();
    });
  });

  describe("symbol finding", () => {
    it("should find function definition", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `def my_function():
    return 42`);

      const line = await proxy.findSymbolFallback("my_function", testFile);
      expect(line).toBe(0);
    });

    it("should find class definition", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `class MyClass:
    def __init__(self):
        pass`);

      const line = await proxy.findSymbolFallback("MyClass", testFile);
      expect(line).toBe(0);
    });

    it("should find async function", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `async def async_func():
    return await something()`);

      const line = await proxy.findSymbolFallback("async_func", testFile);
      expect(line).toBe(0);
    });

    it("should find variable assignment", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `my_var = 42`);

      const line = await proxy.findSymbolFallback("my_var", testFile);
      expect(line).toBe(0);
    });

    it("should return null for non-existent symbol", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `x = 1`);

      const line = await proxy.findSymbolFallback("nonExistent", testFile);
      expect(line).toBeNull();
    });

    it("should not find symbols outside workspace", async () => {
      const result = await proxy.findSymbolFallback("test", "/etc/passwd");
      expect(result).toBeNull();
    });
  });

  describe("import extraction", () => {
    it("should extract imports from file", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(
        testFile,
        `import os
import sys
from typing import List
from pathlib import Path

def test():
    pass`
      );

      const imports = await proxy.extractImports(testFile);
      expect(Array.isArray(imports)).toBe(true);
      expect(imports.length).toBeGreaterThan(0);
      expect(imports.some((imp) => imp.includes("import os"))).toBe(true);
    });

    it("should handle file without imports", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `def hello():
    return 42`);

      const imports = await proxy.extractImports(testFile);
      expect(Array.isArray(imports)).toBe(true);
      expect(imports.length).toBe(0);
    });

    it("should not extract imports from outside workspace", async () => {
      const imports = await proxy.extractImports("/etc/passwd");
      expect(Array.isArray(imports)).toBe(true);
      expect(imports.length).toBe(0);
    });
  });

  describe("signature extraction", () => {
    it("should extract function signature", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `def my_function(x: int, y: str) -> bool:
    return True`);

      const sig = await proxy.getSignature(testFile, 0);
      expect(sig).toBeDefined();
      expect(sig).toContain("my_function");
    });

    it("should extract multiline signature", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `def long_function(
    x: int,
    y: str,
    z: bool
) -> None:
    pass`);

      const sig = await proxy.getSignature(testFile, 0);
      expect(sig).toBeDefined();
    });

    it("should return null for out-of-bounds line", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, `def test():
    pass`);

      const sig = await proxy.getSignature(testFile, 100);
      expect(sig).toBeNull();
    });

    it("should not extract signatures from outside workspace", async () => {
      const sig = await proxy.getSignature("/etc/passwd", 0);
      expect(sig).toBeNull();
    });
  });

  describe("definition with context", () => {
    it("should get definition with context", async () => {
      const result = await proxy.getDefinitionWithContext("test.py", 0, 0, 3);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should include code slices in results", async () => {
      const testFile = path.join(tempDir, "test.py");
      fs.writeFileSync(testFile, "def test():\n    return 42");

      const result = await proxy.getDefinitionWithContext(testFile, 0, 0, 2);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("references with context", () => {
    it("should get references with context", async () => {
      const result = await proxy.getReferencesWithContext("test.py", 0, 0, 2);
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
      const result = await proxy.getHover("nonexistent.py", 0, 0);
      expect(result).toBeDefined();
    });

    it("should handle definition errors gracefully", async () => {
      const result = await proxy.getDefinition("nonexistent.py", 0, 0);
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
    });
  });
});
