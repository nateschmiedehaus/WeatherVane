import type { ZodObject, ZodRawShape } from "zod";

/**
 * Pass through the full Zod schema for MCP tool registration.
 *
 * Despite the SDK typing `inputSchema` as `ZodRawShape`, it actually needs
 * the full ZodObject because it calls zodToJsonSchema() internally when listing tools.
 *
 * We return `any` to satisfy the type checker while passing the correct runtime value.
 */
export function toJsonSchema<T extends ZodRawShape>(
  schema: ZodObject<T>,
  _name?: string
): any {
  // Return the full schema object, not just .shape
  // The SDK will call zodToJsonSchema() on this when listing tools
  return schema;
}
