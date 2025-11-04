import type {
  AtlasComponentSource,
  AtlasDocSource,
  AtlasPromptSource,
  AtlasSchemaSource,
  AtlasToolSource,
  AtlasQuestion,
} from "./atlas_types.js";

export const ATLAS_VERSION = "v2025-10-25";

export const COMPONENT_SOURCES: AtlasComponentSource[] = [
  {
    id: "state-graph",
    kind: "orchestrator",
    role: "Unified state graph",
    level: "macro",
    version: ATLAS_VERSION,
    intents: [
      "Route tasks through Specify→Monitor",
      "Record router decisions and checkpoints",
      "Enforce plan-delta + retry ceilings",
    ],
    inputs: ["Task envelope", "Run memory", "Model router selection"],
    outputs: ["Planner/Thinker/Implementer calls", "Verify evidence", "Decision journal entries"],
    depends_on: ["model-router", "context-fabric", "policy-controller"],
    tools: [],
    invariants: ["Duplicate patches detected", "Plan delta required before re-entry", "Router decisions logged"],
    risks: ["Infinite loops if plan delta skipped", "Missing checkpoints leads to lost retries"],
    summary:
      "Controls state transitions, collects thinker insights, tracks duplicate patches, and orchestrates Verify/Review/PR/Monitor sequencing.",
    links: {
      code: ["src/orchestrator/state_graph.ts"],
      docs: ["../../docs/autopilot/OVERVIEW.md"],
      schema: ["../../docs/autopilot/DATA_SCHEMAS/atlas_manifest.schema.json"],
    },
  },
  {
    id: "context-fabric",
    kind: "context",
    role: "Context Fabric",
    level: "meso",
    version: ATLAS_VERSION,
    intents: ["Build Local Context Packs", "Maintain anchors + micro-summaries", "Coordinate team panels + handoffs"],
    inputs: ["File/test hints", "Scope signals", "KB references"],
    outputs: ["LCP JSON", "Team panel markdown", "Handoff packages"],
    depends_on: ["state-graph"],
    tools: ["self_briefing_pack"],
    invariants: ["Anchors deduped", "Budget respected", "No secrets written"],
    risks: ["Token overrun", "Stale anchors if hashes ignored"],
    summary:
      "Combines budgeting, navigator, and persistence utilities to keep context pointer-first and within token budgets.",
    links: {
      code: [
        "src/context/context_assembler.ts",
        "src/context/context_budgeting.ts",
        "src/context/knowledge_navigator.ts",
      ],
      docs: ["../../docs/autopilot/CONTEXT_FABRIC.md"],
      schema: ["../../docs/autopilot/DATA_SCHEMAS/local_context_pack.schema.json"],
    },
  },
  {
    id: "model-router",
    kind: "policy",
    role: "Model router",
    level: "meso",
    version: ATLAS_VERSION,
    intents: ["Lock models to Codex 5 + Claude 4.5", "Escalate on circuit-breakers", "Record costs"],
    inputs: ["Router state", "Plan metadata"],
    outputs: ["Model selections per state", "Router decision log"],
    depends_on: [],
    tools: [],
    invariants: ["Only allow listed models", "Escalate after repeated failures"],
    risks: ["Prompt injection via unknown provider", "Cost explosion"],
    summary: "Chooses codex/claude variants per capability tag and records auditing metadata.",
    links: {
      code: [
        "src/orchestrator/model_router.ts",
        "src/orchestrator/model_policy.yaml",
      ],
      docs: ["../../docs/MODEL_ROUTING_POLICY.md"],
    },
  },
  {
    id: "policy-controller",
    kind: "policy",
    role: "Policy controller",
    level: "meso",
    version: ATLAS_VERSION,
    intents: ["Enforce autopilot rules", "Record escalations + incidents"],
    inputs: ["State graph events", "Critical findings"],
    outputs: ["Policy audit entries", "Plan-delta requirements"],
    depends_on: ["state-graph"],
    tools: [],
    invariants: ["Incidents opened before bypass", "No secrets surfaced"],
    risks: ["Policies drifting from docs"],
    summary: "Bridges governance prompts with runtime enforcement, halting PR flow when guardrails trip.",
    links: {
      code: ["src/orchestrator/policy_controller.ts"],
      docs: ["../../docs/AUTOPILOT_STATUS.md"],
    },
  },
  {
    id: "atlas-introspection",
    kind: "mcp_tool",
    role: "Atlas MCP endpoints",
    level: "micro",
    version: ATLAS_VERSION,
    intents: ["Describe mission", "List tools", "Serve schemas/prompts", "Return briefing pack"],
    inputs: ["Atlas manifest", "Prompt registry"],
    outputs: ["JSON descriptions", "References"],
    depends_on: ["state-graph"],
    tools: ["self_describe", "self_list_tools", "self_get_schema", "self_get_prompt", "self_briefing_pack"],
    invariants: ["Pointer-first answers", "Hashes verified"],
    risks: ["Serving stale data if generator not run"],
    summary: "Provides self-describing metadata so any agent can introspect the Autopilot environment in one hop.",
    links: {
      code: ["src/atlas/atlas_service.ts"],
      docs: ["../../docs/autopilot/OVERVIEW.md"],
      schema: ["../../docs/autopilot/DATA_SCHEMAS/atlas_manifest.schema.json"],
    },
  },
  {
    id: "roadmap-ops",
    kind: "roadmap",
    role: "Roadmap operations",
    level: "meso",
    version: ATLAS_VERSION,
    intents: ["Create/decompose/replace tasks", "Sync GitHub", "Validate invariants"],
    inputs: ["state/roadmap.yaml", "state/roadmap_inbox.json"],
    outputs: ["Snapshots", "GitHub issues", "Audit entries"],
    depends_on: [],
    tools: ["roadmap.add", "roadmap.decompose"],
    invariants: ["No dependency cycles", "Acceptance never empty", "Parents higher level"],
    risks: ["Drift between roadmap and GitHub"],
    summary: "Transactional API for manipulating roadmap hierarchy with governance + shadow-plan hooks.",
    links: {
      code: [
        "src/state/roadmap_store.ts",
        "src/planner/planner_engine.ts",
      ],
      docs: ["../../docs/autopilot/ROADMAP_OPS.md"],
      schema: ["state/roadmap.yaml"],
    },
  },
];

export const TOOL_SOURCES: AtlasToolSource[] = [
  {
    name: "plan_next",
    description: "Fetch prioritized roadmap tasks (with clusters).",
    path: "src/worker/tool_router.ts",
    preconditions: ["Roadmap synced", "Worker available"],
    postconditions: ["Returns tasks array", "Records correlation id"],
    examples: [
      {
        input: { minimal: true },
        output: { tasks: [{ id: "EXAMPLE" }], correlation_id: "plan:example" },
      },
    ],
  },
  {
    name: "autopilot_status",
    description: "Report autopilot consensus metrics and staffing guidance.",
    path: "src/worker/tool_router.ts",
    preconditions: [],
    postconditions: ["Returns recommendation string", "Includes staffing guidance"],
    examples: [
      {
        input: {},
        output: { recommendation: "Consensus load stable." },
      },
    ],
  },
  {
    name: "self_describe",
    description: "Return mission, versions, core components, policy hashes.",
    path: "src/atlas/atlas_service.ts",
    preconditions: ["Atlas manifest present"],
    postconditions: ["JSON description referencing docs"],
    examples: [
      {
        input: {},
        output: { mission: "Unified Autopilot" },
      },
    ],
  },
  {
    name: "self_list_tools",
    description: "Enumerate MCP tools with schema references and examples.",
    path: "src/atlas/atlas_service.ts",
    preconditions: [],
    postconditions: ["Array of tools"],
    examples: [
      {
        input: {},
        output: { tools: ["plan_next"] },
      },
    ],
  },
  {
    name: "self_get_schema",
    description: "Return JSON schema by id.",
    path: "src/atlas/atlas_service.ts",
    preconditions: ["Schema exists"],
    postconditions: ["Raw schema JSON"] ,
    examples: [
      {
        input: { id: "lcp" },
        output: { id: "lcp", schema: { title: "Local Context Pack" } },
      },
    ],
  },
  {
    name: "self_get_prompt",
    description: "Return canonical prompt text by registry id.",
    path: "src/atlas/atlas_service.ts",
    preconditions: ["Prompt registered"],
    postconditions: ["Prompt text + hash"],
    examples: [
      {
        input: { id: "dod_pr" },
        output: { id: "dod_pr", path: "prompts/dod_pr.md" },
      },
    ],
  },
  {
    name: "self_briefing_pack",
    description: "Return path + hash for Agent Briefing Pack.",
    path: "src/atlas/atlas_service.ts",
    preconditions: [],
    postconditions: ["Briefing pack metadata"],
    examples: [
      {
        input: {},
        output: { pack: "../../docs/autopilot/AGENT_BRIEFING_PACK.json" },
      },
    ],
  },
];

export const PROMPT_SOURCES: AtlasPromptSource[] = [
  {
    id: "dod_pr",
    version: "v2025-10-23",
    path: "prompts/dod_pr.md",
    summary: "Definition of Done + PR checklist",
  },
  {
    id: "reviewer_rubric",
    version: "v2025-10-23",
    path: "prompts/reviewer_rubric.md",
    summary: "Reviewer rubric JSON",
  },
  {
    id: "context_system",
    version: "v2025-10-23",
    path: "../../docs/CONTEXT_SYSTEM.md",
    summary: "Context ladder + budgets",
  },
  {
    id: "atlas_kit",
    version: ATLAS_VERSION,
    path: "../../docs/autopilot/AGENT_README.md",
    summary: "Atlas onboarding instructions",
  },
];

export const SCHEMA_SOURCES: AtlasSchemaSource[] = [
  { id: "lcp", path: "../../docs/autopilot/DATA_SCHEMAS/local_context_pack.schema.json" },
  { id: "atlas_manifest", path: "../../docs/autopilot/DATA_SCHEMAS/atlas_manifest.schema.json" },
];

export const DOC_SOURCES: AtlasDocSource[] = [
  { id: "overview", path: "../../docs/autopilot/OVERVIEW.md" },
  { id: "history", path: "../../docs/autopilot/HISTORY.md" },
  { id: "glossary", path: "../../docs/autopilot/GLOSSARY.md" },
  { id: "faq", path: "../../docs/autopilot/FAQ.md" },
  { id: "toolbox", path: "../../docs/autopilot/TOOLBOX.md" },
  { id: "prompt_registry", path: "../../docs/autopilot/PROMPT_REGISTRY.md" },
  { id: "agent_readme", path: "../../docs/autopilot/AGENT_README.md" },
  { id: "roadmap_ops", path: "../../docs/autopilot/ROADMAP_OPS.md" },
  { id: "context_fabric", path: "../../docs/autopilot/CONTEXT_FABRIC.md" },
  { id: "security", path: "../../docs/autopilot/SECURITY.md" },
  { id: "quality_bar", path: "../../docs/autopilot/QUALITY_BAR.md" },
  { id: "governance", path: "../../docs/autopilot/GOVERNANCE.md" },
  { id: "dsd", path: "../../docs/autopilot/DSD.md" },
];

export const QNA_SOURCES: AtlasQuestion[] = [
  {
    id: "verify-gate",
    question: "What gates must pass in Verify?",
    pointer: "../../docs/autopilot/OVERVIEW.md",
    expectation: "Tests + lint + type + security + license + changed-lines coverage",
  },
  {
    id: "roadmap-decompose",
    question: "Where is roadmap.decompose documented?",
    pointer: "../../docs/autopilot/ROADMAP_OPS.md",
    expectation: "add/decompose/replace/move/split/etc.",
  },
  {
    id: "prompt-location",
    question: "How do I find the reviewer rubric prompt?",
    pointer: "../../docs/autopilot/PROMPT_REGISTRY.md",
    expectation: "`reviewer_rubric`",
  },
  {
    id: "context-budget",
    question: "How are context budgets determined?",
    pointer: "../../docs/autopilot/CONTEXT_FABRIC.md",
    expectation: "context_budgeting.ts",
  },
  {
    id: "router-lock",
    question: "Which models are allowed?",
    pointer: "../../docs/autopilot/OVERVIEW.md",
    expectation: "Codex 5 and Claude 4.5",
  },
  {
    id: "atlas-generator",
    question: "How do I regenerate the manifest?",
    pointer: "../../docs/autopilot/AGENT_README.md",
    expectation: "src/atlas/generate_atlas.ts",
  },
  {
    id: "briefing-pack",
    question: "Where is the Briefing Pack stored?",
    pointer: "../../docs/autopilot/AGENT_README.md",
    expectation: "docs/autopilot/AGENT_BRIEFING_PACK.json",
  },
  {
    id: "team-panel",
    question: "Where do assumptions/open questions live?",
    pointer: "../../docs/autopilot/CONTEXT_FABRIC.md",
    expectation: "Team Panel",
  },
  {
    id: "history",
    question: "When was Context Fabric shipped?",
    pointer: "../../docs/autopilot/HISTORY.md",
    expectation: "2025-10-15",
  },
  {
    id: "glossary",
    question: "What is an Attestation Guard?",
    pointer: "../../docs/autopilot/GLOSSARY.md",
    expectation: "hash comparison of manifest + prompt_registry",
  },
];
