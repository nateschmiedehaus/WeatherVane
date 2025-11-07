/**
 * Knowledge extraction from source code.
 *
 * Extracts semantic understanding, call graphs, and structural knowledge
 * from TypeScript/JavaScript files.
 */

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { CallGraphEdge, ExtractionLog, FunctionKnowledge } from './knowledge_types.js';
import type { KnowledgeStorage } from './knowledge_storage.js';

/**
 * Extracts knowledge from source files.
 */
export class KnowledgeExtractor {
  constructor(
    private workspaceRoot: string,
    private storage: KnowledgeStorage,
  ) {}

  /**
   * Extract knowledge from all staged files in git.
   */
  async extractFromStagedFiles(): Promise<ExtractionLog> {
    const startTime = Date.now();
    const gitSha = this.getCurrentGitSha();

    try {
      // Get staged files
      const stagedFiles = this.getStagedFiles();

      // Filter for TypeScript/JavaScript files
      const codeFiles = stagedFiles.filter((file) =>
        /\.(ts|js|tsx|jsx)$/.test(file) && !file.includes('node_modules'),
      );

      let functionsExtracted = 0;
      let edgesExtracted = 0;

      // Extract from each file
      for (const file of codeFiles) {
        const filePath = path.join(this.workspaceRoot, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const result = await this.extractFromFile(file, content, gitSha);

          functionsExtracted += result.functions.length;
          edgesExtracted += result.edges.length;
        } catch (error) {
          console.warn(`Failed to extract from ${file}:`, error);
        }
      }

      const durationMs = Date.now() - startTime;

      return {
        timestamp: new Date().toISOString(),
        gitSha,
        functionsExtracted,
        edgesExtracted,
        durationMs,
        success: true,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        timestamp: new Date().toISOString(),
        gitSha,
        functionsExtracted: 0,
        edgesExtracted: 0,
        durationMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract knowledge from a single file.
   */
  async extractFromFile(
    relativePath: string,
    content: string,
    gitSha: string,
  ): Promise<{
    functions: FunctionKnowledge[];
    edges: CallGraphEdge[];
  }> {
    const functions: FunctionKnowledge[] = [];
    const edges: CallGraphEdge[] = [];

    // Simple regex-based extraction (can be enhanced with AST parsing)
    const functionMatches = this.extractFunctionDefinitions(content);

    for (const match of functionMatches) {
      const functionId = `${relativePath}:${match.name}`;

      // Generate semantic purpose (simplified - would use LLM in production)
      const purpose = this.generateSemanticPurpose(match.name, match.body);

      // Calculate complexity (simplified - count branches)
      const complexity = this.calculateComplexity(match.body);

      // TODO: Get coverage from test results (placeholder for now)
      const coverage = 0;

      functions.push({
        id: functionId,
        filePath: relativePath,
        name: match.name,
        purpose,
        confidence: 0.7, // Simplified - would be based on LLM confidence
        complexity,
        coverage,
        lastUpdated: new Date().toISOString(),
        gitSha,
      });

      // Extract call graph edges
      const calls = this.extractFunctionCalls(match.body);
      for (const call of calls) {
        edges.push({
          from: functionId,
          to: `${relativePath}:${call.name}`, // Simplified - should resolve imports
          filePath: relativePath,
          lineNumber: call.lineNumber,
        });
      }
    }

    const knownFunctionIds = new Set<string>();

    for (const fn of functions) {
      this.storage.storeFunctionKnowledge(fn);
      knownFunctionIds.add(fn.id);
    }

    for (const edge of edges) {
      if (!knownFunctionIds.has(edge.to)) {
        continue;
      }
      this.storage.storeCallGraphEdge(edge);
    }

    return { functions, edges };
  }

  /**
   * Extract function definitions from source code.
   */
  private extractFunctionDefinitions(content: string): Array<{
    name: string;
    body: string;
    lineNumber: number;
  }> {
    const results: Array<{ name: string; body: string; lineNumber: number }> = [];

    // Match function declarations: function name(...) { ... }
    const funcRegex = /function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g;
    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1];
      const braceIndex = funcRegex.lastIndex - 1;
      const block = this.extractBlock(content, braceIndex);
      if (!block) continue;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      results.push({ name, body: block.body, lineNumber });
    }

    // Match arrow functions: const name = (...) => { ... }
    const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^{=]+)?=>\s*\{/g;

    while ((match = arrowRegex.exec(content)) !== null) {
      const name = match[1];
      const braceIndex = arrowRegex.lastIndex - 1;
      const block = this.extractBlock(content, braceIndex);
      if (!block) continue;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      results.push({ name, body: block.body, lineNumber });
    }

    // Match class methods: methodName(...) { ... }
    const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g;

    while ((match = methodRegex.exec(content)) !== null) {
      const name = match[1];
      // Skip if it looks like a function keyword (already captured)
      const prefix = content.substring(Math.max(0, match.index - 10), match.index);
      if (/\bfunction\b/.test(prefix) || /[=]/.test(prefix)) continue;
      const braceIndex = methodRegex.lastIndex - 1;
      const block = this.extractBlock(content, braceIndex);
      if (!block) continue;
      const lineNumber = content.substring(0, match.index).split('\n').length;
      results.push({ name, body: block.body, lineNumber });
    }

    return results;
  }

  private extractBlock(content: string, startIndex: number): { body: string; endIndex: number } | null {
    let depth = 0;
    for (let index = startIndex; index < content.length; index += 1) {
      const char = content[index];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            body: content.slice(startIndex + 1, index),
            endIndex: index,
          };
        }
      }
    }
    return null;
  }

  /**
   * Generate semantic purpose for a function (simplified).
   * In production, this would use an LLM to generate semantic descriptions.
   */
  private generateSemanticPurpose(name: string, body: string): string {
    // Heuristics-based purpose generation (placeholder for LLM)

    // Convert camelCase to words
    const words = name.replace(/([A-Z])/g, ' $1').trim().toLowerCase();

    // Detect patterns
    const lowerName = name.toLowerCase();
    if (lowerName.startsWith('get')) return `get ${words.replace('get ', '')}`;
    if (lowerName.startsWith('set')) return `set ${words.replace('set ', '')}`;
    if (lowerName.startsWith('create')) return `create ${words.replace('create ', '')}`;
    if (lowerName.startsWith('delete')) return `delete ${words.replace('delete ', '')}`;
    if (lowerName.startsWith('validate')) return `validate ${words.replace('validate ', '')}`;
    if (lowerName.startsWith('calculate')) return `calculate ${words.replace('calculate ', '')}`;
    if (lowerName.startsWith('is') || lowerName.startsWith('has')) return `check if ${words}`;

    // Check for common keywords in body
    if (body.includes('return')) return `Returns ${words} based on logic`;
    if (body.includes('throw')) return `Validates ${words} and throws on error`;
    if (body.includes('log')) return `Logs ${words} information`;

    // Fallback
    return `Performs ${words} operation`;
  }

  /**
   * Calculate cyclomatic complexity (simplified).
   */
  private calculateComplexity(body: string): number {
    // Count decision points (simplified McCabe complexity)
    let complexity = 1; // Base complexity

    // Count branches
    const branches = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b\?\b/g, // Ternary operator
      /\b&&\b/g, // Logical AND
      /\b\|\|\b/g, // Logical OR
    ];

    for (const pattern of branches) {
      const matches = body.match(pattern);
      if (matches) complexity += matches.length;
    }

    if (complexity === 1) {
      const statementCount = body
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean).length;
      if (statementCount > 2) {
        complexity += Math.min(2, Math.floor(statementCount / 3));
      }
    }

    return complexity;
  }

  /**
   * Extract function calls from code body.
   */
  private extractFunctionCalls(body: string): Array<{ name: string; lineNumber: number }> {
    const calls: Array<{ name: string; lineNumber: number }> = [];

    // Match function calls: functionName(...)
    const callRegex = /(\w+)\s*\(/g;
    let match;

    while ((match = callRegex.exec(body)) !== null) {
      const name = match[1];
      const lineNumber = body.substring(0, match.index).split('\n').length;

      // Filter out keywords
      const keywords = ['if', 'for', 'while', 'switch', 'catch', 'function', 'return'];
      if (!keywords.includes(name)) {
        calls.push({ name, lineNumber });
      }
    }

    return calls;
  }

  /**
   * Get list of staged files from git.
   */
  private getStagedFiles(): string[] {
    try {
      const output = execSync('git diff --cached --name-only', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
      });

      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get current git SHA.
   */
  private getCurrentGitSha(): string {
    try {
      const output = execSync('git rev-parse HEAD', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
      });

      return output.trim();
    } catch {
      return 'unknown';
    }
  }
}
