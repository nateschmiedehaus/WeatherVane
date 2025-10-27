/**
 * LSP Manager - Lifecycle and Process Management
 * 
 * Handles spawning, initializing, and managing LSP servers (tsserver and pyright).
 * Provides a unified interface for querying language servers.
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

import {
  LSPServerStatus,
  LSPRequest,
  LSPResponse,
  InitializeParams,
  SymbolKind,
} from "./types";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

export class LSPManager extends EventEmitter {
  private tsserverProcess: ChildProcess | null = null;
  private pyrightProcess: ChildProcess | null = null;
  private workspaceRoot: string;
  private requestId: number = 0;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private tsserverInitialized: boolean = false;
  private pyrightInitialized: boolean = false;
  private requestTimeout: number = 5000; // 5 seconds

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Start the TypeScript language server
   */
  async startTypeScriptServer(): Promise<void> {
    if (this.tsserverProcess) {
      return; // Already running
    }

    return new Promise((resolve, reject) => {
      try {
        // tsserver is typically installed with typescript
        this.tsserverProcess = spawn("node", [
          require.resolve("typescript/lib/tsserver"),
        ]);

        this.tsserverProcess.on("error", (err) => {
          console.error("TypeScript server error:", err);
          this.tsserverInitialized = false;
          reject(err);
        });

        // Read from stdout
        let buffer = "";
        this.tsserverProcess.stdout?.on("data", (data) => {
          buffer += data.toString();
          this.handleServerOutput(buffer, "typescript");
        });

        this.tsserverProcess.stderr?.on("data", (data) => {
          console.error("TypeScript server stderr:", data.toString());
        });

        // Initialize the server
        this.initializeServer("typescript").then(() => {
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Start the Python language server (pyright)
   */
  async startPythonServer(): Promise<void> {
    if (this.pyrightProcess) {
      return; // Already running
    }

    return new Promise((resolve, reject) => {
      try {
        // pyright is typically installed as a npm package or python tool
        this.pyrightProcess = spawn("pyright", ["--stdout"]);

        this.pyrightProcess.on("error", (err) => {
          console.error("Python server error:", err);
          this.pyrightInitialized = false;
          reject(err);
        });

        // Read from stdout
        let buffer = "";
        this.pyrightProcess.stdout?.on("data", (data) => {
          buffer += data.toString();
          this.handleServerOutput(buffer, "python");
        });

        this.pyrightProcess.stderr?.on("data", (data) => {
          console.error("Python server stderr:", data.toString());
        });

        // Initialize the server
        this.initializeServer("python").then(() => {
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Initialize a language server
   */
  private async initializeServer(
    language: "typescript" | "python"
  ): Promise<void> {
    const params: InitializeParams = {
      processId: process.pid,
      rootPath: this.workspaceRoot,
      rootUri: `file://${this.workspaceRoot}`,
      capabilities: {
        textDocument: {
          synchronization: {},
          completion: {},
          hover: {},
          definition: {},
          references: {},
        },
      },
    };

    const response = await this.sendRequest(language, "initialize", params);

    if (language === "typescript") {
      this.tsserverInitialized = true;
    } else {
      this.pyrightInitialized = true;
    }

    // Send 'initialized' notification
    this.sendNotification(language, "initialized", {});
  }

  /**
   * Handle output from language servers
   */
  private handleServerOutput(buffer: string, language: string): void {
    // Split by line and look for JSON-RPC responses
    const lines = buffer.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        // LSP servers send responses in content-length header format or direct JSON
        if (line.startsWith('Content-Length:')) {
          // Skip header lines
          continue;
        }

        const json = JSON.parse(line) as LSPResponse;
        if (json.id !== undefined && json.id !== null) {
          // This is a response
          const pending = this.pendingRequests.get(json.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(json.id);

            if (json.error) {
              pending.reject(new Error(json.error.message));
            } else {
              pending.resolve(json.result);
            }
          }
        }
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  /**
   * Send a request to a language server
   */
  private sendRequest(
    language: "typescript" | "python",
    method: string,
    params?: unknown
  ): Promise<unknown> {
    const process =
      language === "typescript" ? this.tsserverProcess : this.pyrightProcess;

    if (!process) {
      return Promise.reject(
        new Error(`${language} server not running`)
      );
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out`));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const request: LSPRequest = {
        jsonrpc: "2.0",
        id: requestId,
        method,
        params,
      };

      const message = JSON.stringify(request) + "\n";
      process.stdin?.write(message, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });
    });
  }

  /**
   * Send a notification (no response expected)
   */
  private sendNotification(
    language: "typescript" | "python",
    method: string,
    params?: unknown
  ): void {
    const process =
      language === "typescript" ? this.tsserverProcess : this.pyrightProcess;

    if (!process) {
      return;
    }

    const request = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const message = JSON.stringify(request) + "\n";
    process.stdin?.write(message);
  }

  /**
   * Find definition of a symbol
   */
  async findDefinition(
    language: "typescript" | "python",
    filePath: string,
    line: number,
    character: number
  ): Promise<unknown> {
    return this.sendRequest(language, "textDocument/definition", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });
  }

  /**
   * Find all references to a symbol
   */
  async findReferences(
    language: "typescript" | "python",
    filePath: string,
    line: number,
    character: number
  ): Promise<unknown> {
    return this.sendRequest(language, "textDocument/references", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  /**
   * Get hover information
   */
  async getHoverInfo(
    language: "typescript" | "python",
    filePath: string,
    line: number,
    character: number
  ): Promise<unknown> {
    return this.sendRequest(language, "textDocument/hover", {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });
  }

  /**
   * Get server status
   */
  getServerStatus(language: "typescript" | "python"): LSPServerStatus {
    const isTypeScript = language === "typescript";
    const process = isTypeScript ? this.tsserverProcess : this.pyrightProcess;
    const initialized = isTypeScript
      ? this.tsserverInitialized
      : this.pyrightInitialized;

    return {
      language,
      running: process !== null && !process.killed,
      pid: process?.pid,
      workspaceRoot: this.workspaceRoot,
      initialized,
    };
  }

  /**
   * Stop a language server
   */
  async stopServer(language: "typescript" | "python"): Promise<void> {
    const process =
      language === "typescript" ? this.tsserverProcess : this.pyrightProcess;

    if (process && !process.killed) {
      // Send shutdown notification
      this.sendRequest(language, "shutdown", null);

      // Kill process after graceful shutdown attempt
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          process.kill("SIGKILL");
          resolve();
        }, 1000);

        process.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });

        process.kill("SIGTERM");
      });
    }
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    await Promise.all([
      this.tsserverProcess ? this.stopServer("typescript") : null,
      this.pyrightProcess ? this.stopServer("python") : null,
    ]);

    this.tsserverProcess = null;
    this.pyrightProcess = null;
    this.tsserverInitialized = false;
    this.pyrightInitialized = false;
  }

  /**
   * Get all pending requests (for debugging)
   */
  getPendingRequests(): number {
    return this.pendingRequests.size;
  }
}

// Export singleton instance
let lspManager: LSPManager | null = null;

export function getLSPManager(workspaceRoot: string): LSPManager {
  if (!lspManager) {
    lspManager = new LSPManager(workspaceRoot);
  }
  return lspManager;
}

export function resetLSPManager(): void {
  lspManager = null;
}
