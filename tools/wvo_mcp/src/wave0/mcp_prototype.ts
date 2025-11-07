/**
 * MCP Prototype - Proof of Concept for Real MCP Integration
 *
 * This prototype demonstrates:
 * 1. Connecting to the actual MCP server
 * 2. Executing real tools (not fake fs calls)
 * 3. Handling responses and errors
 * 4. Provider switching capability
 */

import { spawn, ChildProcess } from 'child_process';
import { logInfo, logError } from '../telemetry/logger.js';

interface MCPToolResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export class MCPPrototype {
  private mcpProcess: ChildProcess | null = null;
  private isConnected = false;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  /**
   * Connect to the real MCP server via stdio
   */
  async connect(): Promise<void> {
    try {
      logInfo('MCPPrototype: Starting MCP server connection');

      // Get the actual MCP server path
      const serverPath = process.env.MCP_SERVER_PATH ||
                        './dist/index.js';

      // Spawn the MCP server process
      this.mcpProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MCP_MODE: 'stdio',
          WORKSPACE_ROOT: process.cwd()
        }
      });

      // Handle server stdout (responses)
      this.mcpProcess.stdout?.on('data', (data) => {
        this.handleServerResponse(data.toString());
      });

      // Handle server stderr (errors/logs)
      this.mcpProcess.stderr?.on('data', (data) => {
        logInfo(`MCP Server: ${data.toString().trim()}`);
      });

      // Handle server exit
      this.mcpProcess.on('exit', (code) => {
        logError(`MCP Server exited with code ${code}`);
        this.isConnected = false;
      });

      // Send initialization request
      await this.sendRequest('initialize', {
        protocolVersion: '1.0',
        clientInfo: {
          name: 'wave0-prototype',
          version: '0.1.0'
        },
        capabilities: {
          tools: {
            call: true
          }
        }
      });

      this.isConnected = true;
      logInfo('MCPPrototype: Connected successfully');
    } catch (error) {
      logError('MCPPrototype: Connection failed', { error });
      throw error;
    }
  }

  /**
   * Execute a tool via MCP
   */
  async executeTool(toolName: string, params: any): Promise<MCPToolResponse> {
    if (!this.isConnected) {
      throw new Error('MCP not connected');
    }

    try {
      const response = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: params
      });

      return {
        success: true,
        result: response.content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Send request to MCP server
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      // Store callback
      this.pendingRequests.set(id, { resolve, reject });

      // Create JSON-RPC request
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      // Send to server
      this.mcpProcess?.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 30000);
    });
  }

  /**
   * Handle response from MCP server
   */
  private handleServerResponse(data: string) {
    try {
      // Parse each line as a separate JSON-RPC response
      const lines = data.trim().split('\n');
      for (const line of lines) {
        if (!line) continue;

        const response = JSON.parse(line);
        const { id, result, error } = response;

        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          if (error) {
            pending.reject(new Error(error.message));
          } else {
            pending.resolve(result);
          }
        }
      }
    } catch (error) {
      logError('MCPPrototype: Failed to parse response', { error, data });
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.mcpProcess) {
      this.mcpProcess.kill('SIGTERM');
      this.mcpProcess = null;
      this.isConnected = false;
    }
  }
}

/**
 * Test the prototype
 */
export async function testPrototype(): Promise<void> {
  const mcp = new MCPPrototype();

  try {
    logInfo('=== MCP Prototype Test Starting ===');

    // Test 1: Connect to server
    logInfo('Test 1: Connecting to MCP server...');
    await mcp.connect();
    logInfo('✅ Connected successfully');

    // Test 2: Read a file
    logInfo('Test 2: Reading package.json via MCP...');
    const readResult = await mcp.executeTool('fs_read', {
      path: 'package.json'
    });
    if (readResult.success && readResult.result?.includes('"name"')) {
      logInfo('✅ File read successfully via MCP');
    } else {
      throw new Error('Failed to read file via MCP');
    }

    // Test 3: Write a test file
    logInfo('Test 3: Writing test file via MCP...');
    const testContent = '# MCP Prototype Test\n\nThis file was written via real MCP!';
    const writeResult = await mcp.executeTool('fs_write', {
      path: 'state/evidence/AFP-W0-SELF-IMPROVEMENT-TEST-20251106/mcp_test.md',
      content: testContent
    });
    if (writeResult.success) {
      logInfo('✅ File written successfully via MCP');
    } else {
      throw new Error('Failed to write file via MCP');
    }

    // Test 4: Execute a command
    logInfo('Test 4: Executing command via MCP...');
    const cmdResult = await mcp.executeTool('cmd_run', {
      cmd: 'echo "MCP command execution works!"'
    });
    if (cmdResult.success) {
      logInfo('✅ Command executed successfully via MCP');
      logInfo(`Output: ${cmdResult.result}`);
    } else {
      throw new Error('Failed to execute command via MCP');
    }

    // Test 5: List available tools
    logInfo('Test 5: Listing available tools...');
    const toolsResult = await mcp.executeTool('tools/list', {});
    if (toolsResult.success) {
      logInfo('✅ Tools listed successfully');
      logInfo(`Available tools: ${JSON.stringify(toolsResult.result?.tools?.length || 0)} tools`);
    }

    logInfo('=== MCP Prototype Test Complete ===');
    logInfo('All tests passed! MCP integration is working.');

  } catch (error) {
    logError('Prototype test failed', { error });
    throw error;
  } finally {
    await mcp.disconnect();
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPrototype().catch(console.error);
}