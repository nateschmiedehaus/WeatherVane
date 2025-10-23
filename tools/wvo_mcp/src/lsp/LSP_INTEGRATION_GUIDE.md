# LSP Proxy Tools Integration Guide

## Overview

The LSP (Language Server Protocol) proxy tools provide symbol-aware context extraction for TypeScript and Python code. They enable precise code navigation, definition finding, reference tracking, and hover information without needing full AST parsing.

## Architecture

### Components

1. **LSPManager** (`lsp_manager.ts`)
   - Lifecycle management for tsserver and pyright processes
   - JSON-RPC communication with language servers
   - Request/response handling with timeouts
   - Singleton pattern for process reuse

2. **TypeScriptLSPProxy** (`tsserver_proxy.ts`)
   - Wrapper around TypeScript language server
   - Methods: `getDefinition()`, `getReferences()`, `getHover()`
   - Code slice extraction with context
   - Fallback symbol finding via regex patterns

3. **PythonLSPProxy** (`pyright_proxy.ts`)
   - Wrapper around Python language server (Pyright)
   - Same interface as TypeScript proxy for consistency
   - Additional methods: `extractImports()`, `getSignature()`
   - Python-specific pattern matching for symbols

4. **MCP Server Integration** (`index-claude.ts`)
   - Five LSP tools registered with the MCP server:
     - `lsp_initialize`: Start language servers
     - `lsp_server_status`: Check server health
     - `lsp_definition`: Find symbol definition
     - `lsp_references`: Find all symbol references
     - `lsp_hover`: Get type information
   - Tools are discoverable via standard MCP tools/list call
   - Full input validation with Zod schemas

5. **Tool Router Integration** (`worker/tool_router.ts`)
   - Internal handlers for tool routing
   - Used by orchestrator for multi-agent execution

6. **Input Schemas** (`tools/input_schemas.ts`)
   - Zod schemas for input validation
   - Type-safe argument parsing

## API Reference

### LSP Tools

#### `lsp_definition`
Find the definition of a symbol at a specific location.

**Input:**
```json
{
  "language": "typescript" | "python",
  "filePath": "/path/to/file",
  "line": 10,
  "character": 5,
  "contextLines": 5
}
```

**Output:**
```json
{
  "ok": true,
  "definitions": [
    {
      "symbol": "functionName",
      "filePath": "/path/to/definition.ts",
      "line": 42,
      "character": 0,
      "kind": 5,
      "codeSlice": {
        "filePath": "/path/to/definition.ts",
        "startLine": 37,
        "endLine": 47,
        "content": "function functionName() {\n  ...\n}",
        "language": "typescript"
      }
    }
  ]
}
```

#### `lsp_references`
Find all references to a symbol.

**Input:**
```json
{
  "language": "typescript" | "python",
  "filePath": "/path/to/file",
  "line": 10,
  "character": 5,
  "contextLines": 3
}
```

**Output:**
```json
{
  "ok": true,
  "references": {
    "symbol": "functionName",
    "definitions": [...],
    "references": [
      {
        "uri": "file:///path/to/usage.ts",
        "range": {
          "start": {"line": 25, "character": 10},
          "end": {"line": 25, "character": 24}
        }
      }
    ]
  }
}
```

#### `lsp_hover`
Get hover information (type signatures, documentation).

**Input:**
```json
{
  "language": "typescript" | "python",
  "filePath": "/path/to/file",
  "line": 10,
  "character": 5
}
```

**Output:**
```json
{
  "ok": true,
  "info": {
    "contents": "function myFunc(x: number): string",
    "range": {
      "start": {"line": 10, "character": 0},
      "end": {"line": 10, "character": 10}
    }
  }
}
```

#### `lsp_server_status`
Check the status of language servers.

**Input:**
```json
{
  "language": "typescript" // optional
}
```

**Output:**
```json
{
  "ok": true,
  "servers": {
    "typescript": {
      "language": "typescript",
      "running": true,
      "pid": 12345,
      "workspaceRoot": "/path/to/workspace",
      "initialized": true
    },
    "python": {
      "language": "python",
      "running": true,
      "pid": 12346,
      "workspaceRoot": "/path/to/workspace",
      "initialized": true
    }
  }
}
```

#### `lsp_initialize`
Start language servers for symbol-aware context.

**Input:**
```json
{
  "workspaceRoot": "/path/to/workspace"
}
```

**Output:**
```json
{
  "ok": true,
  "servers": {
    "typescript": {...},
    "python": {...}
  }
}
```

## MCP Tool Registration

The LSP tools are now fully integrated into the Claude Code MCP server (`index-claude.ts`). This makes them discoverable and callable from Claude Code directly.

### Tool Discovery

All five LSP tools are available via the standard MCP tools/list:
- `lsp_initialize`
- `lsp_server_status`
- `lsp_definition`
- `lsp_references`
- `lsp_hover`

### Direct Tool Usage in Claude Code

Users can call these tools directly from Claude Code prompts or code:

```typescript
// Example: Find a function definition
const result = await lsp_definition({
  language: "typescript",
  filePath: "/path/to/context_assembler.ts",
  line: 100,
  character: 10,
  contextLines: 5
});
```

## Usage Examples

### Example 1: Find Function Definition

```typescript
// Tool call
const result = await runTool({
  name: "lsp_definition",
  input: {
    language: "typescript",
    filePath: "/path/to/context_assembler.ts",
    line: 150,
    character: 10,
    contextLines: 5
  }
});

// Result includes the exact function definition with surrounding context
```

### Example 2: Find All References

```typescript
const result = await runTool({
  name: "lsp_references",
  input: {
    language: "python",
    filePath: "/path/to/data_service.py",
    line: 42,
    character: 15
  }
});

// Get all places where this function/class is used
```

### Example 3: Get Type Information

```typescript
const result = await runTool({
  name: "lsp_hover",
  input: {
    language: "typescript",
    filePath: "/path/to/api.ts",
    line: 100,
    character: 5
  }
});

// Get function signature and documentation
```

## Integration with Context Assembler

The LSP tools enhance the existing `ContextAssembler` to provide better file and symbol selection.

### Current Flow (Text-Based)
```
Task Description
  ↓
Extract Keywords
  ↓
Heuristic Matching (keyword → files)
  ↓
Code Search (FTS5 index)
  ↓
Return Up to 5 Files (full content)
```

### Enhanced Flow (Symbol-Aware)
```
Task Description
  ↓
Extract Keywords + Candidate Symbols
  ↓
LSP Definition Lookup (exact locations)
  ↓
LSP References (related code)
  ↓
Code Slice Extraction (only relevant sections)
  ↓
Return Focused Context (50-70% fewer tokens)
```

### Integration Points

**In `ContextAssembler.inferFilesToRead()`:**

```typescript
// After identifying candidate files
const candidates = await this.codeSearchIndex.search(keywords);

// NEW: Use LSP for symbol-aware refinement
for (const candidate of candidates) {
  const definitions = await lspProxy.getDefinitionWithContext(
    candidate.filePath,
    candidate.line,
    candidate.character,
    contextLines
  );
  
  // Extract only the code slices, not entire files
  const relevantSlices = definitions.map(d => d.codeSlice);
  context.push(...relevantSlices);
}
```

## Performance Characteristics

### Server Startup
- **tsserver**: ~500ms (lazy-initialized on first request)
- **pyright**: ~1000ms (includes Python env detection)

### Request Latency
- **Definition lookup**: ~50-200ms (depending on workspace size)
- **References search**: ~200-500ms (depends on symbol usage)
- **Hover info**: ~30-100ms (cached type information)

### Memory Usage
- **tsserver**: ~150-200MB (keeps workspace AST in memory)
- **pyright**: ~200-300MB (Python type checking overhead)

### Optimization Tips

1. **Warm up servers** - Call `lsp_initialize` at startup if expecting heavy LSP usage
2. **Cache results** - LSP responses can be cached per (file, line, char) triple
3. **Batch requests** - Group multiple LSP queries into single orchestration pass
4. **Set reasonable timeouts** - Default 5 seconds per request prevents hanging

## Error Handling

### Server Crashes
- LSP manager automatically restarts crashed servers on next request
- Fallback to regex-based symbol finding if LSP unavailable
- Graceful degradation to CodeSearch index

### Network Errors
- JSON-RPC timeouts (5 seconds default)
- Request retry logic (up to 1 attempt)
- Clear error messages in tool response

### File System Errors
- Workspace validation (prevents path traversal attacks)
- File not found → empty result set (not an error)
- Permission denied → logged warning, continue with other files

## Security Considerations

### Workspace Boundary Enforcement
All file paths are validated to prevent directory traversal:

```typescript
private isInWorkspace(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  const relPath = path.relative(this.workspaceRoot, normalized);
  return !relPath.startsWith("..");
}
```

### Input Validation
- Line/character numbers validated as non-negative integers
- File paths normalized and checked against workspace root
- Zod schemas enforce type safety on all inputs

### Process Isolation
- Language servers run as separate child processes
- Stdio communication (not network sockets)
- Automatic process cleanup on tool shutdown

## Testing

### Unit Tests
```bash
npm test -- lsp_manager.test.ts
npm test -- tsserver_proxy.test.ts
npm test -- pyright_proxy.test.ts
```

### Integration Tests
```bash
npm test -- worker/tool_router.test.ts  # LSP tool handler tests
```

### Manual Testing
```typescript
// Initialize servers
await runTool({ name: "lsp_initialize", input: { workspaceRoot } });

// Test definition lookup
await runTool({
  name: "lsp_definition",
  input: {
    language: "typescript",
    filePath: "/path/to/context_assembler.ts",
    line: 100,
    character: 10
  }
});

// Check server health
await runTool({ name: "lsp_server_status", input: {} });
```

## Future Enhancements

1. **Semantic Search** - Index symbols by kind (function, class, type)
2. **Smart Context Slicing** - Extract complete function bodies with dependencies
3. **Cross-Language Navigation** - Find Python imports of TypeScript types
4. **Incremental Indexing** - Watch files and update LSP workspace in real-time
5. **IDE Integration** - Expose LSP endpoints for editor plugins

## Troubleshooting

### "tsserver not found"
- Ensure TypeScript is installed: `npm list typescript`
- Check `NODE_PATH` includes node_modules/.bin

### "pyright not found"
- Install globally: `pip install pyright` or `npm install -g pyright`
- Check Python path: `which pyright`

### LSP Servers Not Responding
- Check process PIDs: `ps aux | grep tsserver`
- Monitor logs for crashes
- Restart orchestrator: `./tools/wvo_mcp/scripts/restart_mcp.sh`

### High Memory Usage
- Gracefully stop unused servers: `lsp_server_status` → stop if idle
- Reduce workspace size in tsconfig.json/pyrightconfig.json

## References

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [TypeScript Language Server](https://github.com/Microsoft/TypeScript/blob/main/src/server/server.ts)
- [Pyright Documentation](https://microsoft.github.io/pyright)
