# Design: AFP-AUTOPILOT-V2-MODEL-20251120

## Context
Model Intelligence needs to reflect ARCHITECTURE_V2: Fast/Standard/Deep routing using latest models (Gemini 3 / Claude 3.5 / o3) with capability tags and a Scout hook to keep the registry fresh.

## Five Forces
- **Coherence:** Existing model_registry/manager/discovery patterns reused; no new deps.
- **Economy:** Additive changes with embedded seeds; no extra config files.
- **Locality:** Changes limited to models module + new test.
- **Visibility:** Capability tags and lane helpers explicit; logs on fallback.
- **Evolution:** Scout hook + TTL support adaptation.

Pattern: `model_lanes_capability`. Leverage: medium (routing). Assurance: unit test for lanes + guardrail monitor.

## Via Negativa
Cannot delete registry; minimal additive capability tags and lane helpers to avoid scope creep.

## Refactor vs Repair
Small refactor/addition: extend schema, add helpers; not a patch.

## Alternatives
1) Generic provider-agnostic model type only — simpler but loses provider fields. Rejected to keep legacy data intact.
2) External JSON registry file — rejected to stay within file cap and avoid new assets.
Selected: embed seeds + extend schema/types minimally.

## Complexity
Low-medium: small type extensions and helper functions; mitigated with tests and keeping provider-specific helpers intact.

## Implementation Plan
- Extend `model_registry.ts` types to include Gemini/o3 and capability tags; add `getModelsByCapability` and seeds for Fast/Standard/Deep models.
- Add lane helpers to `model_manager.ts` (fast/standard/deep getters using registry helper).
- Add Scout hook in `model_discovery.ts` (stub refresh call, extend provider handling if needed).
- Add `model_registry.test.ts` to verify lane selection and fallback.
- Tests to run: `npx vitest run src/models/model_registry.test.ts`; guardrail monitor; commit:check.

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope/LOC within limits
- [x] Tests authored in PLAN
- [x] Wave0 not touched; no extra deps

