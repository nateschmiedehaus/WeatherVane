#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "test-server",
  version: "1.0.0",
}, {
  capabilities: {}
});

server.registerTool(
  "hello",
  {
    description: "Say hello",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  async () => {
    return {
      content: [{ type: "text", text: "Hello, world!" }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Test server ready");
