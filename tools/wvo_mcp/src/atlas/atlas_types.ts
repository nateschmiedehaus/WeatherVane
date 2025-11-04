export type ComponentKind =
  | "orchestrator"
  | "agent"
  | "mcp_tool"
  | "policy"
  | "prompt"
  | "schema"
  | "reconciler"
  | "context"
  | "roadmap"
  | "governance";

export type ComponentLevel = "micro" | "meso" | "macro";

export interface AtlasLinks {
  code?: string[];
  docs?: string[];
  schema?: string[];
}

export interface AtlasComponentSource {
  id: string;
  kind: ComponentKind;
  role: string;
  level: ComponentLevel;
  version: string;
  intents: string[];
  inputs: string[];
  outputs: string[];
  depends_on: string[];
  tools: string[];
  invariants: string[];
  risks: string[];
  summary: string;
  links: AtlasLinks;
}

export interface AtlasToolSource {
  name: string;
  description: string;
  path: string;
  preconditions: string[];
  postconditions: string[];
  examples: Array<{ input: unknown; output: unknown }>;
}

export interface AtlasPromptSource {
  id: string;
  version: string;
  path: string;
  summary: string;
}

export interface AtlasSchemaSource {
  id: string;
  path: string;
}

export interface AtlasDocSource {
  id: string;
  path: string;
}

export interface AtlasManifestComponentRef {
  id: string;
  card: string;
  code_refs: Array<{ path: string; sha256: string }>
  doc_refs: string[];
  schema_refs: string[];
}

export interface AtlasManifest {
  version: string;
  generated_at: string;
  components: AtlasManifestComponentRef[];
  prompts: Array<{ id: string; path: string; sha256: string }>;
  tools: Array<{ name: string; path: string; description: string }>;
  schemas: Array<{ id: string; path: string; sha256: string }>;
  docs: string[];
}

export interface BriefingPack {
  version: string;
  mission: string;
  architecture: { diagram: string; components: string[] };
  how_to_use: string;
  tools: string;
  prompts: string;
  policies: string[];
  schemas: string;
  roadmap_ops: string;
  context_fabric: string;
  control_plane: string;
  history: string;
  faq: string;
  glossary: string;
  manifest: string;
  hash: string;
  attestation: {
    manifest_sha: string;
    prompt_registry_sha: string;
  };
}

export interface AtlasQuestion {
  id: string;
  question: string;
  pointer: string;
  expectation: string;
}
