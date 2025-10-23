# LSP Tools - Quick Start Guide

The LSP (Language Server Protocol) tools are now available in Claude Code MCP for symbol-aware code navigation.

## Overview

Five tools enable intelligent code understanding:

| Tool | Purpose | Language |
|------|---------|----------|
| `lsp_initialize` | Start language servers | Both |
| `lsp_server_status` | Check server health | Both |
| `lsp_definition` | Find symbol definitions | TS/Python |
| `lsp_references` | Find all symbol usages | TS/Python |
| `lsp_hover` | Get type information | TS/Python |

---

## Quick Examples

### 1. Initialize Language Servers

Start both TypeScript and Python servers:

```json
{
  "workspaceRoot": "/path/to/workspace"
}
```

**Response:** Server status for both language servers.

### 2. Find Symbol Definition

Locate where a function is defined:

```json
{
  "language": "typescript",
  "filePath": "src/utils/helpers.ts",
  "line": 25,
  "character": 10,
  "contextLines": 5
}
```

**Response:**
- Symbol name and location
- Code context (surrounding lines)
- File path, line number, character position

### 3. Find All References

See every place a function/variable is used:

```json
{
  "language": "typescript",
  "filePath": "src/utils/helpers.ts",
  "line": 25,
  "character": 10,
  "contextLines": 3
}
```

**Response:**
- All locations where symbol is referenced
- Code context around each usage

### 4. Get Type Information

Retrieve function signature and documentation:

```json
{
  "language": "typescript",
  "filePath": "src/api/client.ts",
  "line": 100,
  "character": 5
}
```

**Response:**
- Type signature
- Documentation/comments
- Symbol kind (function, class, variable, etc.)

### 5. Check Server Status

Verify language servers are running:

```json
{}  // or { "language": "typescript" } for specific server
```

**Response:**
- Running status
- Process ID (PID)
- Initialization state

---

## Use Cases

### Understanding Unfamiliar Code

1. Call `lsp_definition` on an imported function
2. Get code context with surrounding lines
3. See the actual implementation

### Refactoring Impact Analysis

1. Call `lsp_references` on a function
2. Review all 20+ usages at once
3. Plan refactoring safely

### Type Safety Verification

1. Call `lsp_hover` on a variable
2. See inferred type
3. Verify type expectations

### Cross-File Navigation

1. Find function definition across codebase
2. See all imports and usages
3. Understand architecture

---

## API Reference

### Parameters

**language** (required for definition/references/hover)
- `"typescript"` - for .ts, .tsx, .js files
- `"python"` - for .py files

**filePath** (required for definition/references/hover)
- Relative path from workspace root
- Example: `"src/components/Button.tsx"`

**line** (required for definition/references/hover)
- 0-indexed line number
- Example: `10` means line 11 in editor

**character** (required for definition/references/hover)
- 0-indexed column number
- Example: `5` means column 6

**contextLines** (optional)
- Default: 5 for definition, 3 for references
- Number of lines to include around result

**workspaceRoot** (required for initialize)
- Absolute path to workspace root
- Example: `"/Users/name/projects/myapp"`

---

## Performance Tips

1. **Warm up servers first**
   ```
   Call lsp_initialize once at session start
   ```

2. **Cache results**
   - Same (file, line, char) queries return same results
   - Re-use if querying same symbols

3. **Batch requests**
   - Group related LSP queries together
   - Reduces context switching

4. **Set reasonable contextLines**
   - Use smaller values (3-5) for quick lookups
   - Use larger values (10-15) for full understanding

---

## Error Handling

### "Server not running"
→ Call `lsp_initialize` first

### "File not found"
→ Verify filePath is relative to workspace root

### "Invalid position"
→ Check line/character numbers are within file bounds

### "Workspace boundary violation"
→ Ensure filePath doesn't use `../` to escape workspace

---

## Limitations

| Limitation | Note |
|-----------|------|
| Server startup | ~500ms TypeScript, ~1000ms Python |
| Memory usage | 150-300MB per server (can kill idle) |
| LSP version | Assumes LSP 3.x (standard) |
| Python env | Auto-detected by Pyright |

---

## Architecture

```
Claude Code
    ↓
lsp_* tools (MCP)
    ↓
index-claude.ts handlers
    ↓
LSPManager (lifecycle)
    ├→ TypeScriptLSPProxy → tsserver
    └→ PythonLSPProxy → pyright
    ↓
LSP Protocol (JSON-RPC)
    ↓
Symbol Information
    ↓
Results with context
```

---

## Integration Examples

### In Context Assembler (Future)

```typescript
// Instead of full file content:
const symbol = await lspDefinition({
  language: 'typescript',
  filePath: 'src/api.ts',
  line: 100,
  character: 5
});

// Extract only relevant code slices
const context = symbol.definitions
  .map(d => d.codeSlice)
  .filter(s => s.content.length < 500);

// Result: ~50-70% fewer tokens!
```

### Refactoring Safety

```typescript
// Find all usages before renaming
const refs = await lspReferences({
  language: 'typescript',
  filePath: 'src/utils.ts',
  line: 50,
  character: 0
});

// Review impact: ${refs.references.length} places to update
```

### Type Discovery

```typescript
// Understand function expectations
const hover = await lspHover({
  language: 'typescript',
  filePath: 'src/services/api.ts',
  line: 200,
  character: 5
});

// Type: ${hover.info.contents}
```

---

## Comparison: LSP vs Text Search

| Task | Text Search | LSP Tools | Winner |
|------|-------------|-----------|--------|
| Find exact definition | Heuristic | Precise | LSP |
| Find all usages | Find all occurrences | Symbol-aware | LSP |
| Get type info | Comments only | Full types | LSP |
| Handle refactoring | Manual | Automated | LSP |
| Context extraction | Full file | Code slices | LSP |
| Performance | Fast | 50-500ms | Text |

**Recommendation:** Use LSP tools for code understanding, text search for quick scanning.

---

## Troubleshooting

### "TypeScript server not found"
```bash
npm list typescript
# Ensure typescript is installed in node_modules
```

### "Python server not responding"
```bash
which pyright
# Install: pip install pyright
# Or: npm install -g pyright
```

### High Memory Usage
- Keep servers running per-session (don't start/stop repeatedly)
- Can close manually if needed (no explicit close tool yet)

### Slow Definition Lookup
- First query in file takes longer (LSP initialization)
- Subsequent queries in same file are faster (cached)

---

## What's Next

1. **Context Assembler Integration** - LSP-based code slicing
2. **Semantic Search** - Index symbols by kind
3. **Cross-Language Navigation** - Find Python imports of TypeScript types
4. **Incremental Updates** - Watch files and update LSP workspace

---

## References

- [LSP Integration Guide](../tools/wvo_mcp/src/lsp/LSP_INTEGRATION_GUIDE.md)
- [Language Server Protocol Spec](https://microsoft.github.io/language-server-protocol/)
- [TypeScript Server](https://github.com/Microsoft/TypeScript/blob/main/src/server/server.ts)
- [Pyright Documentation](https://microsoft.github.io/pyright)
