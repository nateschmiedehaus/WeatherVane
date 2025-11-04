# Persona Router Module

**Purpose**: Provides PersonaSpec canonicalization, hashing, and adapter for PromptCompiler integration.

**Related Tasks**: IMP-21-22-SYNC (handshake), IMP-22 (full implementation)

---

## Compiler Adapter (IMP-22)

### PersonaSpec Interface

```typescript
export interface PersonaSpec {
  phase_role?: string;        // Role for this phase
  domain_overlays?: string[]; // Domain-specific content
  skill_packs?: string[];     // Available skill packs
  capabilities?: string[];    // Capabilities enabled
}
```

### Canonicalization and Hashing

**Full Implementation** (IMP-22): Deterministic canonicalization with sorted keys and SHA-256 hashing.

```typescript
import {
  canonicalizePersonaSpec,
  hashPersonaSpec,
  formatPersonaForCompiler
} from './compiler_adapter';

const spec: PersonaSpec = {
  phase_role: 'expert-planner',
  domain_overlays: ['api', 'web']
};

// 1. Canonical JSON string (deterministic, sorted keys)
const canonical = canonicalizePersonaSpec(spec);
// Returns: '{"domain_overlays":["api","web"],"phase_role":"expert-planner"}'

// 2. SHA-256 hash for drift detection
const hash = hashPersonaSpec(spec);
// Returns: '4e07408562bedb8b...' (64-char hex)

// 3. Format for compiler persona slot (same as canonical)
const personaString = formatPersonaForCompiler(spec);
// Returns: '{"domain_overlays":["api","web"],"phase_role":"expert-planner"}'
```

### Key Properties

- **Deterministic**: Same input → same output (regardless of key order, array order, or execution context)
- **Stable Hash**: SHA-256 of canonical form, used for persona drift detection
- **Backward Compatible**: All fields optional, gracefully handles partial specs
- **No External Deps**: Built on Node.js crypto module

---

## Usage with PromptCompiler

```typescript
import { PromptCompiler } from '../prompt/compiler';
import { formatPersonaForCompiler, PersonaSpec } from './compiler_adapter';

const compiler = new PromptCompiler();
const compiled = compiler.compile({
  system: 'You are Claude, an AI assistant.',
  phase: 'STRATEGIZE: Define objective and risks.',
  persona: formatPersonaForCompiler(spec)
});
```

---

## Testing

Run tests:

```bash
npm test -- src/persona_router/__tests__/compiler_adapter.test.ts
```

**Test Coverage**: 18 comprehensive tests
- 6 canonicalization tests (determinism, key order, array order, empty/partial specs)
- 6 hashing tests (SHA-256 format, stability, independence, hash differences)
- 3 formatter tests
- 3 compiler integration tests (persona slot, hash differences, stability)

---

## See Also

- **Prompt Compiler README**: tools/wvo_mcp/src/prompt/README.md
- **IMP-21-22-SYNC Evidence**: state/evidence/IMP-21-22-SYNC/
- **Roadmap Dependencies**: state/roadmap.dependencies.yaml
