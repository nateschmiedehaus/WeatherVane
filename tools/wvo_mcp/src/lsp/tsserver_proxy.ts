/**
 * TypeScript Language Server Proxy
 * 
 * Wraps tsserver communication and provides helper methods for
 * finding definitions, references, and type information.
 */

import * as fs from "fs";
import * as path from "path";
import { LSPManager } from "./lsp_manager.js";
import {
  DefinitionResult,
  ReferencesResult,
  HoverResult,
  SymbolDefinition,
  SymbolReferences,
  CodeSlice,
  Location,
  SymbolKind,
} from "./types.js";

export class TypeScriptLSPProxy {
  private lspManager: LSPManager;
  private workspaceRoot: string;

  constructor(lspManager: LSPManager, workspaceRoot: string) {
    this.lspManager = lspManager;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Find the definition of a symbol at a given position
   */
  async getDefinition(
    filePath: string,
    line: number,
    character: number
  ): Promise<DefinitionResult> {
    try {
      const result = (await this.lspManager.findDefinition(
        "typescript",
        filePath,
        line,
        character
      )) as unknown;

      if (Array.isArray(result)) {
        return {
          locations: result as Location[],
        };
      } else if (result && typeof result === "object" && "uri" in result) {
        return {
          locations: [result as Location],
        };
      }

      return { locations: [] };
    } catch (error) {
      return {
        locations: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Find all references to a symbol
   */
  async getReferences(
    filePath: string,
    line: number,
    character: number
  ): Promise<ReferencesResult> {
    try {
      const result = (await this.lspManager.findReferences(
        "typescript",
        filePath,
        line,
        character
      )) as unknown;

      if (Array.isArray(result)) {
        return {
          locations: result as Location[],
        };
      }

      return { locations: [] };
    } catch (error) {
      return {
        locations: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get hover information for a symbol
   */
  async getHover(
    filePath: string,
    line: number,
    character: number
  ): Promise<HoverResult> {
    try {
      const result = await this.lspManager.getHoverInfo(
        "typescript",
        filePath,
        line,
        character
      );

      if (result && typeof result === "object") {
        return {
          info: result as any,
        };
      }

      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract code slice from a file (bounded by line numbers)
   */
  private extractCodeSlice(
    filePath: string,
    startLine: number,
    endLine: number
  ): CodeSlice | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      const actualStart = Math.max(0, startLine);
      const actualEnd = Math.min(lines.length, endLine + 1);

      const sliceContent = lines.slice(actualStart, actualEnd).join("\n");

      return {
        filePath,
        startLine: actualStart,
        endLine: actualEnd - 1,
        content: sliceContent,
        language: "typescript",
      };
    } catch {
      return null;
    }
  }

  /**
   * Find definition with context (includes code snippet)
   */
  async getDefinitionWithContext(
    filePath: string,
    line: number,
    character: number,
    contextLines: number = 5
  ): Promise<SymbolDefinition[]> {
    const defResult = await this.getDefinition(filePath, line, character);

    const definitions: SymbolDefinition[] = [];

    for (const location of defResult.locations) {
      const uri = location.uri;
      const defFile = uri.replace("file://", "");

      // Extract code with context
      const startLine = Math.max(0, location.range.start.line - contextLines);
      const endLine = location.range.end.line + contextLines;

      const codeSlice = this.extractCodeSlice(defFile, startLine, endLine);

      if (codeSlice) {
        definitions.push({
          symbol: path.basename(defFile),
          filePath: defFile,
          line: location.range.start.line,
          character: location.range.start.character,
          kind: SymbolKind.Variable, // Default, would need actual kind from LSP
          codeSlice,
        });
      }
    }

    return definitions;
  }

  /**
   * Find all references with locations
   */
  async getReferencesWithContext(
    filePath: string,
    line: number,
    character: number,
    contextLines: number = 3
  ): Promise<SymbolReferences> {
    const definitions = await this.getDefinitionWithContext(
      filePath,
      line,
      character,
      contextLines
    );

    const refResult = await this.getReferences(filePath, line, character);

    return {
      symbol: definitions[0]?.symbol || "unknown",
      definitions,
      references: refResult.locations,
    };
  }

  /**
   * Validate file path is within workspace
   */
  private isInWorkspace(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    const relPath = path.relative(this.workspaceRoot, normalized);
    return !relPath.startsWith("..");
  }

  /**
   * Find symbol in a file (basic pattern matching if LSP unavailable)
   */
  async findSymbolFallback(
    symbol: string,
    filePath: string
  ): Promise<number | null> {
    if (!this.isInWorkspace(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      // Look for function, class, const, let, var declarations
      // Escape special regex characters in symbol name
      const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const patterns = [
        new RegExp(`\\bfunction\\s+${escapedSymbol}\\b`),
        new RegExp(`\\bclass\\s+${escapedSymbol}\\b`),
        new RegExp(`\\bconst\\s+${escapedSymbol}\\b`),
        new RegExp(`\\blet\\s+${escapedSymbol}\\b`),
        new RegExp(`\\bvar\\s+${escapedSymbol}\\b`),
        new RegExp(`\\bexport\\s+(?:default\\s+)?(?:function|class)\\s+${escapedSymbol}\\b`),
      ];

      for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
          if (pattern.test(lines[i])) {
            return i;
          }
        }
      }
    } catch {
      // File read error
    }

    return null;
  }
}
