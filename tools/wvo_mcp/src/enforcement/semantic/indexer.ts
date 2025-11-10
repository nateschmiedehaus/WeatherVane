/**
 * Indexer for Semantic Search
 *
 * Chunks and indexes codebase artifacts for retrieval.
 * Processes code, tests, docs, ADRs, and specs.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { ChunkMetadata } from './vector_store.js';
import crypto from 'node:crypto';

export interface IndexConfig {
  workspaceRoot: string;
  patterns: {
    code: string[];
    test: string[];
    doc: string[];
    adr: string[];
    spec: string[];
  };
  chunkSize: number;
  chunkOverlap: number;
}

const DEFAULT_CONFIG: IndexConfig = {
  workspaceRoot: process.cwd(),
  patterns: {
    code: ['src/**/*.ts', 'src/**/*.js'],
    test: ['**/*.test.ts', '**/*.spec.ts'],
    doc: ['**/*.md', 'docs/**/*'],
    adr: ['**/ADR-*.md', 'docs/adrs/**/*.md'],
    spec: ['**/spec*.md', '**/SPEC-*.md']
  },
  chunkSize: 1000, // characters
  chunkOverlap: 200 // character overlap between chunks
};

/**
 * Indexer for processing and chunking documents
 */
export class Indexer {
  private config: IndexConfig;

  constructor(config?: Partial<IndexConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Index all documents matching patterns
   */
  async indexWorkspace(): Promise<ChunkMetadata[]> {
    const allChunks: ChunkMetadata[] = [];

    // Process each document type
    for (const [type, patterns] of Object.entries(this.config.patterns)) {
      for (const pattern of patterns) {
        const files = await this.findFiles(pattern);

        for (const file of files) {
          const chunks = await this.processFile(file, type as ChunkMetadata['type']);
          allChunks.push(...chunks);
        }
      }
    }

    return allChunks;
  }

  /**
   * Index specific files
   */
  async indexFiles(files: string[], type: ChunkMetadata['type']): Promise<ChunkMetadata[]> {
    const allChunks: ChunkMetadata[] = [];

    for (const file of files) {
      const chunks = await this.processFile(file, type);
      allChunks.push(...chunks);
    }

    return allChunks;
  }

  /**
   * Process a single file into chunks
   */
  private async processFile(
    filePath: string,
    type: ChunkMetadata['type']
  ): Promise<ChunkMetadata[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(this.config.workspaceRoot, filePath);

      // For code files, try to chunk by functions/classes
      if (type === 'code' || type === 'test') {
        return this.chunkCode(content, relativePath, type);
      }

      // For markdown, chunk by sections
      if (type === 'doc' || type === 'adr' || type === 'spec') {
        return this.chunkMarkdown(content, relativePath, type);
      }

      // Default: simple chunking
      return this.simpleChunk(content, relativePath, type);
    } catch (error) {
      console.warn(`Failed to process ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Chunk code files by functions and classes
   */
  private chunkCode(
    content: string,
    filePath: string,
    type: ChunkMetadata['type']
  ): ChunkMetadata[] {
    const chunks: ChunkMetadata[] = [];
    const lines = content.split('\n');

    // Find functions and classes
    const symbols = this.extractSymbols(content);

    for (const symbol of symbols) {
      const chunk: ChunkMetadata = {
        id: this.generateId(filePath, symbol.name),
        path: filePath,
        type,
        language: this.detectLanguage(filePath),
        symbol: symbol.name,
        lineStart: symbol.lineStart,
        lineEnd: symbol.lineEnd,
        content: lines.slice(symbol.lineStart - 1, symbol.lineEnd).join('\n'),
        timestamp: Date.now()
      };
      chunks.push(chunk);
    }

    // If no symbols found or content is too large, fall back to simple chunking
    if (chunks.length === 0 || content.length > this.config.chunkSize * 10) {
      chunks.push(...this.simpleChunk(content, filePath, type));
    }

    return chunks;
  }

  /**
   * Chunk markdown by sections
   */
  private chunkMarkdown(
    content: string,
    filePath: string,
    type: ChunkMetadata['type']
  ): ChunkMetadata[] {
    const chunks: ChunkMetadata[] = [];
    const lines = content.split('\n');

    // Find headers
    interface Section {
      title: string;
      start: number;
      end: number;
    }
    const sections: Section[] = [];
    let currentSection: { title: string; start: number } | null = null;

    lines.forEach((line, index) => {
      if (line.match(/^#{1,3}\s+/)) {
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            start: currentSection.start,
            end: index - 1
          });
        }
        currentSection = {
          title: line.replace(/^#+\s+/, ''),
          start: index
        };
      }
    });

    // Add last section
    if (currentSection) {
      const finalSection: { title: string; start: number } = currentSection;
      sections.push({
        title: finalSection.title,
        start: finalSection.start,
        end: lines.length - 1
      });
    }

    // Create chunks from sections
    for (const section of sections) {
      const sectionContent = lines.slice(section.start, section.end + 1).join('\n');

      // If section is too large, split it
      if (sectionContent.length > this.config.chunkSize) {
        chunks.push(...this.simpleChunk(sectionContent, filePath, type));
      } else {
        chunks.push({
          id: this.generateId(filePath, section.title),
          path: filePath,
          type,
          lineStart: section.start + 1,
          lineEnd: section.end + 1,
          content: sectionContent,
          timestamp: Date.now()
        });
      }
    }

    // Fall back if no sections found
    if (chunks.length === 0) {
      chunks.push(...this.simpleChunk(content, filePath, type));
    }

    return chunks;
  }

  /**
   * Simple chunking by character count
   */
  private simpleChunk(
    content: string,
    filePath: string,
    type: ChunkMetadata['type']
  ): ChunkMetadata[] {
    const chunks: ChunkMetadata[] = [];
    const lines = content.split('\n');

    let currentChunk = '';
    let chunkStart = 1;
    let currentLine = 1;

    for (const line of lines) {
      if (currentChunk.length + line.length > this.config.chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: this.generateId(filePath, `chunk_${chunks.length}`),
          path: filePath,
          type,
          lineStart: chunkStart,
          lineEnd: currentLine - 1,
          content: currentChunk.trim(),
          timestamp: Date.now()
        });

        // Start new chunk with overlap
        const overlapLines = currentChunk.split('\n').slice(-5).join('\n');
        currentChunk = overlapLines + '\n' + line;
        chunkStart = Math.max(1, currentLine - 5);
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
      currentLine++;
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push({
        id: this.generateId(filePath, `chunk_${chunks.length}`),
        path: filePath,
        type,
        lineStart: chunkStart,
        lineEnd: currentLine - 1,
        content: currentChunk.trim(),
        timestamp: Date.now()
      });
    }

    return chunks;
  }

  /**
   * Extract symbols (functions, classes) from code
   */
  private extractSymbols(
    content: string
  ): Array<{ name: string; lineStart: number; lineEnd: number }> {
    const symbols: Array<{ name: string; lineStart: number; lineEnd: number }> = [];
    const lines = content.split('\n');

    // Simple regex patterns for common symbols
    const patterns = [
      /^export\s+(async\s+)?function\s+(\w+)/,
      /^(export\s+)?class\s+(\w+)/,
      /^export\s+const\s+(\w+)\s*=/,
      /^const\s+(\w+)\s*=\s*(async\s+)?\(/
    ];

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[2] || match[1];
          if (name && name !== 'async' && name !== 'export') {
            // Find end of symbol (simple heuristic)
            let depth = 0;
            let endLine = index;

            for (let i = index; i < lines.length && i < index + 100; i++) {
              const l = lines[i];
              depth += (l.match(/\{/g) || []).length;
              depth -= (l.match(/\}/g) || []).length;

              if (depth === 0 && i > index) {
                endLine = i;
                break;
              }
            }

            symbols.push({
              name,
              lineStart: index + 1,
              lineEnd: Math.min(endLine + 1, lines.length)
            });
          }
        }
      }
    });

    return symbols;
  }

  /**
   * Find files matching pattern
   */
  private async findFiles(pattern: string): Promise<string[]> {
    const files = globSync(pattern, {
      cwd: this.config.workspaceRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      absolute: true
    });
    return files;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml'
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Generate unique ID for chunk
   */
  private generateId(filePath: string, suffix: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${filePath}:${suffix}`)
      .digest('hex')
      .substring(0, 8);
    return `chunk_${hash}`;
  }

  /**
   * Get indexer statistics
   */
  async getStats(): Promise<{
    patterns: Record<string, number>;
    totalFiles: number;
    totalSize: number;
  }> {
    const stats: Record<string, number> = {};
    let totalFiles = 0;
    let totalSize = 0;

    for (const [type, patterns] of Object.entries(this.config.patterns)) {
      let typeCount = 0;
      for (const pattern of patterns) {
        const files = await this.findFiles(pattern);
        typeCount += files.length;

        for (const file of files) {
          try {
            const stat = await fs.stat(file);
            totalSize += stat.size;
          } catch {}
        }
      }
      stats[type] = typeCount;
      totalFiles += typeCount;
    }

    return {
      patterns: stats,
      totalFiles,
      totalSize
    };
  }
}
