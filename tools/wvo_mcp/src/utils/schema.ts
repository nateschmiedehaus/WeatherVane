import type { ZodObject, ZodRawShape } from "zod";

/**
 * Extract the shape from a Zod object schema for MCP tool registration.
 * The MCP SDK expects the `.shape` property of ZodObject, not the object itself.
 */
export function toJsonSchema<T extends ZodRawShape>(
  schema: ZodObject<T>,
  _name?: string
): T {
  // MCP SDK expects the .shape property of ZodObject
  return schema.shape;
}
