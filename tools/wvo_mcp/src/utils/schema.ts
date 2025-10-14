import type { ZodObject, ZodRawShape } from "zod";

/**
 * Extract the shape from a Zod object schema for MCP tool registration.
 *
 * The MCP SDK's registerTool() wraps `inputSchema` in `z.object(inputSchema)`,
 * so we must pass the raw shape rather than a full JSON schema.
 *
 * ⚠️ Autopilot Guardrail:
 * Do not change this to return JSON Schema again. MCP clients expect the Zod
 * raw shape, and converting to JSON Schema breaks tool registration.
 */
export function toJsonSchema<T extends ZodRawShape>(
  schema: ZodObject<T>,
  _name?: string
): T {
  if (!schema || !schema.shape) {
    console.error("[toJsonSchema] Invalid schema:", schema);
    return {} as T;
  }
  return schema.shape;
}
