import { spawn } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspace = path.resolve(__dirname, '../..', '..');
const defaultServer = path.resolve(__dirname, '..', 'dist', 'index.js');

const serverArg = process.argv[2];
const serverPath = serverArg
  ? (path.isAbsolute(serverArg) ? serverArg : path.resolve(workspace, serverArg))
  : defaultServer;

const planArg = process.argv[3];
const planArgs = planArg ? JSON.parse(planArg) : { minimal: true, max_tasks: 2 };

const server = spawn('node', [serverPath, '--workspace', workspace]);

// Capture stderr (where our console.error logs go)
server.stderr.on('data', (data) => {
  console.log('STDERR:', data.toString());
});

// Capture stdout (MCP protocol messages)
server.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

// Send initialize request
const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
};

setTimeout(() => {
  console.log('Sending initialize...');
  server.stdin.write(JSON.stringify(initializeRequest) + '\n');

  setTimeout(() => {
    // Send tools/list request
    const toolsListRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };
    console.log('Sending tools/list...');
    server.stdin.write(JSON.stringify(toolsListRequest) + '\n');

    setTimeout(() => {
      // Send plan_next tool call
      const toolCallRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'plan_next',
          arguments: planArgs
        }
      };
      console.log('Sending tools/call for plan_next...');
      server.stdin.write(JSON.stringify(toolCallRequest) + '\n');

      setTimeout(() => {
        console.log('Done, killing server...');
        server.kill();
        process.exit(0);
      }, 2000);
    }, 1000);
  }, 1000);
}, 500);
