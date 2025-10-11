import type { ZodObject, ZodRawShape } from "zod";

/**
 * Extract the shape from a Zod object schema for MCP tool registration.
 *
 * The MCP SDK's registerTool() wraps inputSchema in z.object(inputSchema),
 * so we must pass the raw shape, not the full ZodObject.
 *
 * We return `any` to satisfy the type checker while passing the correct runtime value.
 */
export function toJsonSchema<T extends ZodRawShape>(
  schema: ZodObject<T>,
  _name?: string
): any {
  // Return .shape because SDK will wrap it: z.object(inputSchema)
  // Handle null/undefined gracefully
  if (!schema || !schema.shape) {
    console.error('[toJsonSchema] Invalid schema:', schema);
    return {};
  }
  return schema.shape;
}
