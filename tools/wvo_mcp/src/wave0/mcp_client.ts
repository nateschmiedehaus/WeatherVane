/**
 * MCP Client for Wave 0 Autopilot
 *
 * Provides interface to call Claude Code tools via MCP.
 * This is a minimal implementation focused on Wave 0 needs.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logInfo, logError, logWarning } from '../telemetry/logger.js';

export interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class MCPClient {
  private client: Client | null = null;
  private initialized = false;
  private retryDelays = [1000, 2000, 4000]; // Exponential backoff

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logInfo('MCPClient: Initializing MCP connection');

      // For Wave 0, we'll use a simplified approach:
      // Execute tool calls via child_process to call Claude Code CLI
      // This avoids complex MCP server setup for now
      this.initialized = true;

      logInfo('MCPClient: Initialized successfully (CLI mode)');
    } catch (error) {
      logError('MCPClient: Failed to initialize', { error });
      throw new Error(`MCP initialization failed: ${error}`);
    }
  }

  /**
   * Read file contents
   */
  async read(filePath: string): Promise<string> {
    return this.executeWithRetry(async () => {
      logInfo(`MCPClient: Reading file ${filePath}`);

      // For now, use direct file system access
      // In production, this would call MCP Read tool
      const fs = await import('node:fs');
      const path = await import('node:path');

      const absolutePath = path.resolve(filePath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      return content;
    });
  }

  /**
   * Edit existing file
   */
  async edit(filePath: string, oldText: string, newText: string): Promise<void> {
    return this.executeWithRetry(async () => {
      logInfo(`MCPClient: Editing file ${filePath}`);

      const fs = await import('node:fs');
      const path = await import('node:path');

      const absolutePath = path.resolve(filePath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      let content = fs.readFileSync(absolutePath, 'utf-8');
      if (!content.includes(oldText)) {
        throw new Error(`Text to replace not found in ${filePath}`);
      }

      content = content.replace(oldText, newText);
      fs.writeFileSync(absolutePath, content, 'utf-8');
    });
  }

  /**
   * Write new file
   */
  async write(filePath: string, content: string): Promise<void> {
    return this.executeWithRetry(async () => {
      logInfo(`MCPClient: Writing file ${filePath}`);

      const fs = await import('node:fs');
      const path = await import('node:path');

      const absolutePath = path.resolve(filePath);
      const dir = path.dirname(absolutePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(absolutePath, content, 'utf-8');
    });
  }

  /**
   * Execute bash command
   */
  async bash(command: string): Promise<string> {
    return this.executeWithRetry(async () => {
      logInfo(`MCPClient: Executing command: ${command}`);

      const { execSync } = await import('node:child_process');

      try {
        const output = execSync(command, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 30000, // 30 second timeout
        });
        return output;
      } catch (error: any) {
        throw new Error(`Command failed: ${error.message}`);
      }
    });
  }

  /**
   * Search with grep
   */
  async grep(pattern: string, path?: string): Promise<string[]> {
    return this.executeWithRetry(async () => {
      logInfo(`MCPClient: Searching for pattern: ${pattern}`);

      const { execSync } = await import('node:child_process');

      try {
        const searchPath = path || '.';
        const command = `grep -r "${pattern}" ${searchPath} 2>/dev/null || true`;
        const output = execSync(command, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });

        return output
          .split('\n')
          .filter(line => line.trim())
          .slice(0, 100); // Limit results
      } catch (error) {
        logWarning(`MCPClient: Grep failed, returning empty results`, { error });
        return [];
      }
    });
  }

  /**
   * Find files with glob pattern
   */
  async glob(pattern: string): Promise<string[]> {
    return this.executeWithRetry(async () => {
      logInfo(`MCPClient: Finding files with pattern: ${pattern}`);

      const { execSync } = await import('node:child_process');

      try {
        const command = `find . -type f -name "${pattern}" 2>/dev/null || true`;
        const output = execSync(command, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });

        return output
          .split('\n')
          .filter(line => line.trim())
          .slice(0, 100); // Limit results
      } catch (error) {
        logWarning(`MCPClient: Glob failed, returning empty results`, { error });
        return [];
      }
    });
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt = 0
  ): Promise<T> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return await fn();
    } catch (error) {
      if (attempt < this.retryDelays.length) {
        const delay = this.retryDelays[attempt];
        logWarning(`MCPClient: Retrying after ${delay}ms (attempt ${attempt + 1}/3)`, { error });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeWithRetry(fn, attempt + 1);
      }

      logError('MCPClient: Max retries exceeded', { error });
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      // Cleanup MCP connection if using real MCP
      this.client = null;
    }
    this.initialized = false;
  }
}