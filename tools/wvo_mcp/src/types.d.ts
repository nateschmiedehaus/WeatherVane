declare module "@modelcontextprotocol/sdk/server/index.js" {
  import type { ZodRawShape } from "zod";

  type ToolCallback<Args extends ZodRawShape> = (args: Record<keyof Args, unknown>) => Promise<unknown> | unknown;

  interface ToolConfig<Args extends ZodRawShape, Output extends ZodRawShape> {
    title?: string;
    description?: string;
    inputSchema?: Args;
    outputSchema?: Output;
    annotations?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  }

  interface RegisteredTool {
    dispose(): Promise<void> | void;
  }

  interface ServerOptions {
    capabilities?: Record<string, unknown>;
    instructions?: string;
  }

  export class Server {
    constructor(info: { name: string; version: string }, options?: ServerOptions);
    registerTool<InputArgs extends ZodRawShape, OutputArgs extends ZodRawShape>(
      name: string,
      config: ToolConfig<InputArgs, OutputArgs>,
      cb: ToolCallback<InputArgs>,
    ): RegisteredTool;
    connect(transport: { start?: () => Promise<void>; send?: (message: string) => void }): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  export class StdioServerTransport {
    constructor(stdin?: NodeJS.ReadStream, stdout?: NodeJS.WriteStream);
    start(): Promise<void>;
    send(message: string): void;
  }
}
