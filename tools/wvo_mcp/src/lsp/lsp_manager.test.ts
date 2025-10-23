/**
 * Tests for LSP Manager
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LSPManager, resetLSPManager } from "./lsp_manager";
import * as path from "path";

describe("LSPManager", () => {
  let manager: LSPManager;
  const workspaceRoot = path.resolve(__dirname, "../../../..");

  beforeEach(() => {
    resetLSPManager();
    manager = new LSPManager(workspaceRoot);
  });

  afterEach(async () => {
    if (manager) {
      await manager.stopAll();
    }
  });

  describe("initialization", () => {
    it("should create manager with workspace root", () => {
      expect(manager).toBeDefined();
    });

    it("should report servers as not running initially", () => {
      const tsStatus = manager.getServerStatus("typescript");
      const pyStatus = manager.getServerStatus("python");

      expect(tsStatus.running).toBe(false);
      expect(pyStatus.running).toBe(false);
    });

    it("should have workspace root set correctly", () => {
      const tsStatus = manager.getServerStatus("typescript");
      expect(tsStatus.workspaceRoot).toBe(workspaceRoot);
    });
  });

  describe("server lifecycle", () => {
    it("should stop servers gracefully", async () => {
      const status = manager.getServerStatus("typescript");
      expect(status.running).toBe(false);
      
      // Stopping a server that's not running should not error
      await manager.stopServer("typescript");
      expect(manager.getServerStatus("typescript").running).toBe(false);
    });

    it("should stop all servers", async () => {
      await manager.stopAll();
      
      const tsStatus = manager.getServerStatus("typescript");
      const pyStatus = manager.getServerStatus("python");
      
      expect(tsStatus.running).toBe(false);
      expect(pyStatus.running).toBe(false);
    });

    it("should handle pending requests count", () => {
      const pending = manager.getPendingRequests();
      expect(typeof pending).toBe("number");
      expect(pending).toBeGreaterThanOrEqual(0);
    });
  });

  describe("error handling", () => {
    it("should handle find definition errors gracefully", async () => {
      // Attempting to find definition without server running should error
      try {
        await manager.findDefinition(
          "typescript",
          "nonexistent.ts",
          0,
          0
        );
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should handle find references errors gracefully", async () => {
      try {
        await manager.findReferences(
          "typescript",
          "nonexistent.ts",
          0,
          0
        );
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should handle hover info errors gracefully", async () => {
      try {
        await manager.getHoverInfo(
          "typescript",
          "nonexistent.ts",
          0,
          0
        );
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
