# Persona Router Module

**Purpose**: Provides adapter between PersonaSpec (persona_router) and PromptCompiler (prompt).

**Related Tasks**: IMP-21-22-SYNC, IMP-22

---

## Compiler Adapter (IMP-21-22-SYNC)

### PersonaSpec Interface

```typescript
export interface PersonaSpec {
  phase_role?: string;        // Role for this phase
  domain_overlays?: string[]; // Domain-specific content
  skill_packs?: string[];     // Available skill packs
  capabilities?: string[];    // Capabilities enabled
}
```

### formatPersonaForCompiler()

Formats PersonaSpec for the PromptCompiler persona slot.

**Stub Implementation** (IMP-21-22-SYNC): Simple pipe-separated string format.

**Future Implementation** (IMP-22): Proper canonicalization with sorted keys.

```typescript
import { formatPersonaForCompiler } from './compiler_adapter';

const spec = {
  phase_role: 'expert-planner',
  domain_overlays: ['api', 'web']
};

const personaString = formatPersonaForCompiler(spec);
// Returns: "Role: expert-planner | Overlays: api, web"
```

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

**Test Coverage**: 6 integration tests (3 formatter + 3 compiler integration)

---

## See Also

- **Prompt Compiler README**: tools/wvo_mcp/src/prompt/README.md
- **IMP-21-22-SYNC Evidence**: state/evidence/IMP-21-22-SYNC/
- **Roadmap Dependencies**: state/roadmap.dependencies.yaml
