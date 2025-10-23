/**
 * LSP Proxy Types and Interfaces
 * 
 * Defines types for Language Server Protocol communication.
 * These are used by tsserver and pyright proxies to communicate
 * symbol definitions, references, and type information.
 */

/**
 * LSP Position (line and character in a file)
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * LSP Range (start and end positions)
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * LSP Location (file URI and range)
 */
export interface Location {
  uri: string;
  range: Range;
}

/**
 * LSP Symbol Information
 */
export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

/**
 * LSP Symbol Kind enum
 */
export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

/**
 * LSP Definition Request result
 */
export interface DefinitionResult {
  locations: Location[];
  error?: string;
}

/**
 * LSP References Request result
 */
export interface ReferencesResult {
  locations: Location[];
  error?: string;
}

/**
 * LSP Hover Information
 */
export interface HoverInfo {
  contents: string;
  range?: Range;
}

/**
 * LSP Hover Request result
 */
export interface HoverResult {
  info?: HoverInfo;
  error?: string;
}

/**
 * LSP Server Status
 */
export interface LSPServerStatus {
  language: "typescript" | "python";
  running: boolean;
  pid?: number;
  error?: string;
  workspaceRoot: string;
  initialized: boolean;
}

/**
 * LSP Request/Response for JSON-RPC communication
 */
export interface LSPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface LSPResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * LSP initialization parameters
 */
export interface InitializeParams {
  processId: number | null;
  rootPath: string | null;
  rootUri: string | null;
  capabilities: {
    textDocument?: {
      synchronization?: unknown;
      completion?: unknown;
      hover?: unknown;
      definition?: unknown;
      references?: unknown;
    };
  };
}

/**
 * Code location with file content
 */
export interface CodeSlice {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: "typescript" | "javascript" | "python";
}

/**
 * Symbol Definition with related code
 */
export interface SymbolDefinition {
  symbol: string;
  filePath: string;
  line: number;
  character: number;
  kind: SymbolKind;
  codeSlice: CodeSlice;
}

/**
 * Symbol References
 */
export interface SymbolReferences {
  symbol: string;
  definitions: SymbolDefinition[];
  references: Location[];
}
