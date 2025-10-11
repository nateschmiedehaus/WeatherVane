/**
 * Response formatting utilities for better UX
 */

export interface FormattedResponse {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
}

export function formatSuccess(message: string, data?: unknown): FormattedResponse {
  let text = `✅ ${message}\n`;
  if (data) {
    // Compact JSON for token efficiency (was pretty-printed with null, 2)
    text += `\n${JSON.stringify(data)}`;
  }
  return {
    content: [{ type: "text", text }],
  };
}

export function formatError(message: string, details?: string): FormattedResponse {
  let text = `❌ ${message}`;
  if (details) {
    text += `\n\nDetails: ${details}`;
  }
  return {
    content: [{ type: "text", text }],
  };
}

export function formatData(data: unknown, summary?: string): FormattedResponse {
  let text = "";
  if (summary) {
    text = `${summary}\n\n`;
  }
  // Compact JSON for token efficiency (was pretty-printed with null, 2)
  text += `\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;
  return {
    content: [{ type: "text", text }],
  };
}

export function formatList(items: Array<{ title: string; details?: string }>, header?: string): FormattedResponse {
  let text = "";
  if (header) {
    text = `## ${header}\n\n`;
  }

  items.forEach((item, index) => {
    text += `${index + 1}. **${item.title}**\n`;
    if (item.details) {
      text += `   ${item.details}\n`;
    }
    text += "\n";
  });

  return {
    content: [{ type: "text", text }],
  };
}

export function formatTable(headers: string[], rows: string[][]): FormattedResponse {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || "").length))
  );

  let text = "|";
  headers.forEach((h, i) => {
    text += ` ${h.padEnd(colWidths[i])} |`;
  });
  text += "\n|";

  colWidths.forEach(w => {
    text += `${"-".repeat(w + 2)}|`;
  });
  text += "\n";

  rows.forEach(row => {
    text += "|";
    row.forEach((cell, i) => {
      text += ` ${(cell || "").padEnd(colWidths[i])} |`;
    });
    text += "\n";
  });

  return {
    content: [{ type: "text", text }],
  };
}
