/**
 * Safely parses a JSON string with error handling.
 * @param content The JSON string to parse
 * @returns The parsed JSON object
 * @throws Error if parsing fails
 */
export function parseJsonSafe(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error}`);
  }
}