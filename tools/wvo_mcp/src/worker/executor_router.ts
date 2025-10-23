import { SessionContext } from "../session.js";
import {
  cmdRunInput,
  fsReadInput,
  fsWriteInput,
} from "../tools/input_schemas.js";
import { IdempotencyStore } from "../state/idempotency_cache.js";
import {
  IdempotencyMiddleware,
  type WrappedHandler,
} from "../state/idempotency_middleware.js";

type JsonLike = {
  content: Array<{
    type: "text";
    text: string;
  }>;
};

const jsonResponse = (payload: unknown): JsonLike => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(payload),
    },
  ],
});

export interface RunToolPayload {
  name: string;
  input?: unknown;
  idempotencyKey?: string;
}

export class ExecutorToolRouter {
  private readonly idempotencyStore: IdempotencyStore;
  private readonly idempotencyMiddleware: IdempotencyMiddleware;
  private readonly cmdRunHandler: WrappedHandler;
  private readonly fsWriteHandler: WrappedHandler;

  constructor(private readonly session: SessionContext) {
    this.idempotencyStore = new IdempotencyStore();
    this.idempotencyMiddleware = new IdempotencyMiddleware(this.idempotencyStore, true);
    this.cmdRunHandler = this.createCmdRunHandler();
    this.fsWriteHandler = this.createFsWriteHandler();
  }

  async runTool(payload: RunToolPayload): Promise<JsonLike> {
    const { name, input, idempotencyKey } = payload;
    switch (name) {
      case "cmd_run":
        return this.handleCmdRun(input, idempotencyKey);
      case "fs_read":
        return this.handleFsRead(input);
      case "fs_write":
        return this.handleFsWrite(input, idempotencyKey);
      default:
        throw new Error(`executor_unsupported_tool:${name}`);
    }
  }

  private handleCmdRun(input: unknown, idempotencyKey?: string): Promise<JsonLike> {
    return this.cmdRunHandler(input, idempotencyKey) as Promise<JsonLike>;
  }

  private async handleFsRead(input: unknown): Promise<JsonLike> {
    const parsed = fsReadInput.parse(input);
    const content = await this.session.readFile(parsed.path);
    return jsonResponse({ path: parsed.path, content });
  }

  private handleFsWrite(input: unknown, idempotencyKey?: string): Promise<JsonLike> {
    return this.fsWriteHandler(input, idempotencyKey) as Promise<JsonLike>;
  }

  private createCmdRunHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "cmd_run",
      async (rawInput) => {
        const parsed = cmdRunInput.parse(rawInput);
        const result = await this.session.runShellCommand(parsed.cmd);
        return jsonResponse(result);
      },
    );
  }

  private createFsWriteHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "fs_write",
      async (rawInput) => {
        const parsed = fsWriteInput.parse(rawInput);
        await this.session.writeFile(parsed.path, parsed.content);
        return jsonResponse({ ok: true });
      },
    );
  }
}
