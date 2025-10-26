## Context Intelligence System

- **Local-first context**: every agent receives a Local Context Pack (LCP) written to `resources://runs/<id>/context/<Agent>.lcp.json`. Each pack is schema-validated, capped by scope class (Tiny/Small/Medium/Large) and model capability budgets (Codex 5 vs Claude tiers).
- LCP URIs are cached in run-ephemeral memory (`context_pack_uri` per agent) so downstream agents, Verify, and Quality Gate reviewers can reference the exact `resources://` artifact without reassembling context.
- **Context Ladder**:
  1. Nearby code — changed lines + enclosing function headers.
  2. Module view — synopsis, API contracts, invariants, and call-sites.
  3. Repo view — dependency mini-map, recent diffs touching the surface, relevant tests.
  4. Project KB — pinned DoD, reviewer rubric, style guide, security checklist.
  5. Decision snapshots — prior journal entries, task thread, spike outcomes.
  6. External stubs — stub provider interfaces + contract tests (no secrets).
  Stop as soon as acceptance criteria can be satisfied; prefer pointers to anchors rather than raw blobs.
- **Budgets & scope**:
  - Tiny: ≤2 files / 80 LOC, ≤1.5k tokens (Planner).
  - Small: 3–6 files, ≤3k tokens.
  - Medium: multi-module, ≤6k tokens.
  - Large: cross-cutting, ≤12k tokens (long context).
  Budgets scale by model tag: `fast_code < reasoning_high < reasoning_ultra`; `cheap_batch` for summarizers.
- **Schema (LCP)**:
  ```json
  {
    "agent": "Planner|Thinker|Implementer|Verifier|Reviewer|Critical|Supervisor",
    "task_id": "...",
    "goal": "...",
    "acceptance_criteria": ["..."],
    "constraints": ["perf/security/etc"],
    "scope_class": "Tiny|Small|Medium|Large",
    "model_capability": "fast_code|reasoning_high|reasoning_ultra|long_context|cheap_batch",
    "anchors": [{"kind":"code|test|kb|decision","path":"...","lines":"...","rev":"...","ref":"..."}],
    "micro_summaries": [{"ref":"anchor","summary":"≤3 lines insight"}],
    "risk_notes": ["..."],
    "open_questions": ["..."],
    "next_actions": ["..."],
    "token_estimate": 0,
    "bloat_checks": {"dedup_ok": true,"within_budget": true,"no_large_blobs": true}
  }
  ```
- **Knowledge Navigator**:
  - Hashes anchors for freshness; re-fetch if file hash changes.
  - Limits to ≤24 anchors per pack; dedup by `path/ref`.
  - Supports code/test/kb/decision/artifact anchors.
- **Team collaboration**:
  - Task Thread lives in `journal.md` (### Team Panel) + GitHub issue/PR discussion.
  - Handoff packages stored at `resources://runs/<id>/handoff/<from>→<to>.json` with diff refs, evidence, risks, and notes.
  - Unknowns trigger Thinker state or spike branch; spike artifacts linked in journal.
- **Bloat guards**:
  - Configurable token budgets; if exceeded, drop lowest-value anchors (furthest from change surface).
  - Maximum 60 lines per excerpt; no logs >100 lines; no binaries.
  - Stable ordering: code → tests → kb → decisions → artifacts.
- **Evidence chain**:
  - Every recommendation links to artifacts (failing test run, fix, passing run, coverage report).
  - Verifier enforces changed-line coverage, skip/placeholder/no-op detectors, optional mutation smoke.
  - Secrets/integrations replaced with stubs + contract tests; policy.require_human triggered for real credentials.
- **Freshness & invalidation**:
  - Anchors store `rev` hash; if file changes, navigator refreshes.
  - Run-ephemeral memory TTL matches task; summary snapshots recorded in journal.
- **Scaling with model capability**:
  - Router provides capability tag; context assembler selects matching budget to avoid overruns.
  - Reasoning-ultra (Opus) gets richer design snapshots only when ambiguity + scope justify cost.
