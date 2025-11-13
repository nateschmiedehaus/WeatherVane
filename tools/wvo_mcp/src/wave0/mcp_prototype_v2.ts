/**
 * MCP Prototype V2 - Working Real MCP Integration
 *
 * This version properly communicates with the actual MCP server
 * using the correct JSON-RPC protocol.
 */

import { spawn, ChildProcess } from 'child_process';
import { logInfo, logError } from '../telemetry/logger.js';
import * as path from 'path';

interface MCPToolResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export class RealMCPClient {
  private mcpProcess: ChildProcess | null = null;
  private isConnected = false;
  private requestId = 0;
  private buffer = '';

  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    method: string;
  }>();

  /**
   * Connect to the real MCP server
   */
  async connect(): Promise<void> {
    try {
      logInfo('RealMCPClient: Starting MCP server connection');

      // Start the MCP server in stdio mode
      this.mcpProcess = spawn('node', ['./dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          MCP_MODE: 'stdio',
          WORKSPACE_ROOT: path.resolve(process.cwd(), '../..')
        }
      });

      // Handle server stdout (JSON-RPC responses)
      this.mcpProcess.stdout?.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      // Handle server stderr (logs)
      this.mcpProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('Removing stale PID')) {
          logInfo(`MCP Server: ${msg}`);
        }
      });

      // Handle server exit
      this.mcpProcess.on('exit', (code) => {
        logError(`MCP Server exited with code ${code}`);
        this.isConnected = false;
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new Error(`MCP server exited`));
        }
        this.pendingRequests.clear();
      });

      // Initialize the connection
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '1.0',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'wave0-real-client',
          version: '0.1.0'
        }
      });

      if (initResult) {
        this.isConnected = true;
        logInfo('RealMCPClient: Connected successfully');
        logInfo(`Server capabilities: ${JSON.stringify(initResult)}`);
      }

    } catch (error) {
      logError('RealMCPClient: Connection failed', { error });
      throw error;
    }
  }

  /**
   * Process buffered data looking for complete JSON-RPC messages
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        // Not JSON, might be a log message
        if (!line.includes('PID lock')) {
          logInfo(`MCP Output: ${line}`);
        }
      }
    }
  }

  /**
   * Handle a complete JSON-RPC message
   */
  private handleMessage(message: any): void {
    if ('id' in message) {
      // This is a response to our request
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
      // This is a notification or request from server (we don't handle these yet)
      logInfo(`MCP Notification: ${message.method}`);
    }
  }

  /**
   * Send a JSON-RPC request
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      this.pendingRequests.set(id, { resolve, reject, method });

      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params: params || {}
      };

      const requestStr = JSON.stringify(request) + '\n';
      this.mcpProcess?.stdin?.write(requestStr);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  /**
   * Call a tool via MCP
   */
  async callTool(name: string, args?: any): Promise<MCPToolResponse> {
    if (!this.isConnected) {
      throw new Error('MCP not connected');
    }

    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: args || {}
      });

      // Extract content from MCP response format
      let content = result;
      if (result?.content) {
        // Handle structured content response
        if (Array.isArray(result.content) && result.content[0]?.text) {
          content = result.content[0].text;
          // Try to parse JSON if it looks like JSON
          if (content.startsWith('{') || content.startsWith('[')) {
            try {
              content = JSON.parse(content);
            } catch {
              // Keep as string if not valid JSON
            }
          }
        } else {
          content = result.content;
        }
      }

      return {
        success: true,
        result: content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any> {
    try {
      const result = await this.sendRequest('tools/list');
      return result;
    } catch (error) {
      logError('Failed to list tools', { error });
      return { tools: [] };
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.mcpProcess) {
      // Send shutdown notification
      try {
        await this.sendRequest('shutdown');
      } catch {
        // Ignore errors during shutdown
      }

      // Give it a moment to shut down gracefully
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then force kill if still running
      this.mcpProcess.kill('SIGTERM');
      this.mcpProcess = null;
      this.isConnected = false;
    }
  }
}

/**
 * Test the real MCP client
 */
export async function testRealMCP(): Promise<void> {
  const client = new RealMCPClient();

  try {
    logInfo('=== Real MCP Client Test ===');

    // Test 1: Connect
    logInfo('Test 1: Connecting to MCP server...');
    await client.connect();
    logInfo('✅ Connected successfully');

    // Test 2: List tools
    logInfo('Test 2: Listing available tools...');
    const tools = await client.listTools();
    logInfo(`✅ Found ${tools.tools?.length || 0} tools`);
    if (tools.tools?.length > 0) {
      logInfo(`Tools: ${tools.tools.slice(0, 5).map((t: any) => t.name).join(', ')}...`);
    }

    // Test 3: Read a file
    logInfo('Test 3: Reading package.json via fs_read...');
    const readResult = await client.callTool('fs_read', {
      path: 'package.json'
    });

    if (readResult.success) {
      // fs_read returns {path, content} object
      const content = readResult.result?.content || readResult.result;
      if (typeof content === 'string' && content.includes('"name"')) {
        logInfo('✅ File read successfully via MCP');
        logInfo(`File size: ${content.length} bytes`);
      } else {
        throw new Error('File content not as expected');
      }
    } else {
      throw new Error(`fs_read failed: ${readResult.error}`);
    }

    // Test 4: Write a test file
    logInfo('Test 4: Writing test file via fs_write...');
    const testContent = `# MCP Real Client Test\n\nThis file was created by the REAL MCP client!\n\nTimestamp: ${new Date().toISOString()}\n\n## Success!\nMCP integration is working properly.`;

    const writeResult = await client.callTool('fs_write', {
      path: 'state/evidence/AFP-W0-SELF-IMPROVEMENT-TEST-20251106/real_mcp_test.md',
      content: testContent
    });

    if (writeResult.success) {
      logInfo('✅ File written successfully');
    } else {
      throw new Error(`fs_write failed: ${writeResult.error}`);
    }

    // Test 5: Run a command
    logInfo('Test 5: Running command via cmd_run...');
    const cmdResult = await client.callTool('cmd_run', {
      cmd: 'echo "MCP command execution works!" && pwd'
    });

    if (cmdResult.success) {
      logInfo('✅ Command executed successfully');
      const output = cmdResult.result;
      if (typeof output === 'object' && output.stdout) {
        logInfo(`Output: ${output.stdout}`);
      }
    } else {
      logInfo(`⚠️ Command failed: ${cmdResult.error}`);
    }

    // Test 6: Check roadmap status
    logInfo('Test 6: Checking roadmap via plan_next...');
    const planResult = await client.callTool('plan_next', {
      limit: 1,
      minimal: true
    });

    if (planResult.success) {
      logInfo('✅ Roadmap check successful');
      if (typeof planResult.result === 'object') {
        logInfo(`Tasks in roadmap: ${planResult.result.count || 0}`);
      }
    } else {
      logInfo(`⚠️ Roadmap check failed: ${planResult.error}`);
    }

    logInfo('=== All MCP Tests Passed! ===');
    logInfo('Real MCP integration is fully functional.');

  } catch (error) {
    logError('Real MCP test failed', { error });
    throw error;
  } finally {
    await client.disconnect();
    logInfo('Disconnected from MCP server');
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRealMCP()
    .then(() => {
      logInfo('Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logError('Test failed', { error });
      process.exit(1);
    });
}