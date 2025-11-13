/**
 * Real MCP Client for Wave 0.1
 *
 * Production-ready MCP client that replaces the fake stub.
 * Based on the successful prototype, this client:
 * - Connects to actual MCP server via stdio
 * - Executes real tools with proper error handling
 * - Includes retry logic and timeouts
 * - Properly parses MCP responses
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { logInfo, logError, logWarning } from '../telemetry/logger.js';

export interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema?: any;
}

export class RealMCPClient {
  private mcpProcess: ChildProcess | null = null;
  private isConnected = false;
  private requestId = 0;
  private buffer = '';
  private retryCount = 3;
  private retryDelays = [1000, 2000, 4000];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    method: string;
    timestamp: number;
  }>();

  private availableTools: MCPToolInfo[] = [];

  /**
   * Initialize and connect to MCP server
   */
  async initialize(): Promise<void> {
    await this.connect();
  }

  /**
   * Connect to the real MCP server
   */
  private async connect(): Promise<void> {
    try {
      logInfo('RealMCPClient: Connecting to MCP server');

      // Find the MCP server path
      const serverPath = this.findMCPServerPath();
      if (!serverPath) {
        throw new Error('MCP server not found. Please build the project first.');
      }

      // Determine workspace root
      const workspaceRoot = this.findWorkspaceRoot();

      // Spawn the MCP server process
      this.mcpProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(serverPath),
        env: {
          ...process.env,
          MCP_MODE: 'stdio',
          WORKSPACE_ROOT: workspaceRoot
        }
      });

      // Set up event handlers
      this.setupProcessHandlers();

      // Initialize connection
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '1.0',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'wave0-mcp-client',
          version: '0.1.0'
        }
      });

      if (initResult) {
        this.isConnected = true;
        logInfo('RealMCPClient: Connected successfully');

        // Get available tools
        await this.refreshToolsList();
      }

    } catch (error) {
      logError('RealMCPClient: Connection failed', { error });
      throw error;
    }
  }

  /**
   * Find the MCP server executable
   */
  private findMCPServerPath(): string | null {
    const candidates = [
      './dist/index.js',
      '../dist/index.js',
      '../../dist/index.js',
      path.join(__dirname, '../index.js'),
      path.join(__dirname, '../../index.js'),
      path.join(process.cwd(), 'tools/wvo_mcp/dist/index.js')
    ];

    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved)) {
        logInfo(`RealMCPClient: Found MCP server at ${resolved}`);
        return resolved;
      }
    }

    return null;
  }

  /**
   * Find the workspace root directory
   */
  private findWorkspaceRoot(): string {
    // Look for .git directory to find workspace root
    let currentDir = process.cwd();
    while (currentDir !== '/') {
      if (fs.existsSync(path.join(currentDir, '.git'))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    // Fallback to current directory
    return process.cwd();
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.mcpProcess) return;

    // Handle stdout (JSON-RPC responses)
    this.mcpProcess.stdout?.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Handle stderr (logs)
    this.mcpProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('Removing stale PID')) {
        logInfo(`MCP: ${msg}`);
      }
    });

    // Handle process exit
    this.mcpProcess.on('exit', async (code) => {
      logWarning(`MCP server exited with code ${code}`);
      this.isConnected = false;

      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('MCP server exited'));
      }
      this.pendingRequests.clear();

      // Attempt reconnect if not shutting down
      if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logInfo(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          await this.connect();
          this.reconnectAttempts = 0;
        } catch (error) {
          logError('Reconnect failed', { error });
        }
      }
    });

    // Handle errors
    this.mcpProcess.on('error', (error) => {
      logError('MCP process error', { error });
    });
  }

  /**
   * Process buffered data for complete JSON-RPC messages
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch {
        // Not JSON, likely a log message
        if (!line.includes('PID lock')) {
          logInfo(`MCP: ${line}`);
        }
      }
    }
  }

  /**
   * Handle incoming JSON-RPC messages
   */
  private handleMessage(message: any): void {
    if ('id' in message) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Server notification
      logInfo(`MCP notification: ${message.method}`);
    }
  }

  /**
   * Send JSON-RPC request with retry logic
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.mcpProcess || !this.isConnected) {
      throw new Error('MCP not connected');
    }

    return this.executeWithRetry(async () => {
      return new Promise((resolve, reject) => {
        const id = ++this.requestId;
        const timestamp = Date.now();

        this.pendingRequests.set(id, { resolve, reject, method, timestamp });

        const request = {
          jsonrpc: '2.0',
          id,
          method,
          params: params || {}
        };

        this.mcpProcess?.stdin?.write(JSON.stringify(request) + '\n');

        // Timeout
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error(`Request ${method} timed out`));
          }
        }, 30000);
      });
    });
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.retryCount; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        logWarning(`Attempt ${i + 1} failed: ${lastError.message}`);

        if (i < this.retryCount - 1) {
          const delay = this.retryDelays[i] || 5000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Refresh the list of available tools
   */
  private async refreshToolsList(): Promise<void> {
    try {
      const result = await this.sendRequest('tools/list');
      this.availableTools = result.tools || [];
      logInfo(`RealMCPClient: Found ${this.availableTools.length} tools`);
    } catch (error) {
      logError('Failed to list tools', { error });
      this.availableTools = [];
    }
  }

  /**
   * Public method to get available tools
   */
  getAvailableTools(): MCPToolInfo[] {
    return this.availableTools;
  }

  /**
   * Execute a tool with the MCP server
   */
  async executeTool(toolName: string, params?: any): Promise<MCPToolResult> {
    if (!this.isConnected) {
      throw new Error('MCP not connected');
    }

    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: params || {}
      });

      // Parse response based on tool type
      const parsed = this.parseToolResponse(toolName, result);

      return {
        success: true,
        result: parsed
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Parse tool response based on tool type
   */
  private parseToolResponse(toolName: string, result: any): any {
    // Handle structured content response
    if (result?.content) {
      if (Array.isArray(result.content) && result.content[0]?.text) {
        const text = result.content[0].text;

        // Try to parse as JSON
        if (text.startsWith('{') || text.startsWith('[')) {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
        return text;
      }
      return result.content;
    }

    return result;
  }

  /**
   * File operations
   */
  async read(filePath: string): Promise<string> {
    const result = await this.executeTool('fs_read', { path: filePath });
    if (!result.success) {
      throw new Error(`Failed to read ${filePath}: ${result.error}`);
    }

    // fs_read returns {path, content}
    return result.result?.content || result.result;
  }

  async write(filePath: string, content: string): Promise<void> {
    const result = await this.executeTool('fs_write', { path: filePath, content });
    if (!result.success) {
      throw new Error(`Failed to write ${filePath}: ${result.error}`);
    }
  }

  async edit(filePath: string, oldText: string, newText: string): Promise<void> {
    // For now, implement edit as read-modify-write
    // TODO: Use proper edit tool when available
    const content = await this.read(filePath);
    if (!content.includes(oldText)) {
      throw new Error(`Text to replace not found in ${filePath}`);
    }
    const newContent = content.replace(oldText, newText);
    await this.write(filePath, newContent);
  }

  /**
   * Command execution
   */
  async bash(command: string): Promise<string> {
    const result = await this.executeTool('cmd_run', { cmd: command });
    if (!result.success) {
      throw new Error(`Command failed: ${result.error}`);
    }

    // cmd_run returns {stdout, stderr, exitCode}
    const output = result.result;
    if (output?.exitCode !== 0) {
      throw new Error(`Command exited with code ${output.exitCode}: ${output.stderr}`);
    }

    return output?.stdout || '';
  }

  /**
   * Search operations
   */
  async grep(pattern: string, path?: string): Promise<string[]> {
    // TODO: Implement using grep tool
    const cmd = path ? `grep -r "${pattern}" ${path}` : `grep -r "${pattern}"`;
    const output = await this.bash(cmd);
    return output.split('\n').filter(line => line.trim());
  }

  async glob(pattern: string): Promise<string[]> {
    // TODO: Implement using glob tool
    const cmd = `find . -name "${pattern}"`;
    const output = await this.bash(cmd);
    return output.split('\n').filter(line => line.trim());
  }

  /**
   * Roadmap operations
   */
  async planNext(limit: number = 5): Promise<any> {
    const result = await this.executeTool('plan_next', { limit, minimal: true });
    if (!result.success) {
      throw new Error(`Failed to get plan: ${result.error}`);
    }
    return result.result;
  }

  async updateTask(taskId: string, status: string): Promise<void> {
    const result = await this.executeTool('plan_update', {
      task_id: taskId,
      status
    });
    if (!result.success) {
      throw new Error(`Failed to update task: ${result.error}`);
    }
  }

  /**
   * Clean shutdown
   */
  async disconnect(): Promise<void> {
    if (this.mcpProcess) {
      try {
        // Try graceful shutdown
        await this.sendRequest('shutdown');
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        // Ignore errors during shutdown
      }

      // Force kill if still running
      this.mcpProcess.kill('SIGTERM');
      this.mcpProcess = null;
      this.isConnected = false;
    }
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    return this.isConnected && this.mcpProcess !== null;
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; tools: number; pending: number } {
    return {
      connected: this.isConnected,
      tools: this.availableTools.length,
      pending: this.pendingRequests.size
    };
  }
}