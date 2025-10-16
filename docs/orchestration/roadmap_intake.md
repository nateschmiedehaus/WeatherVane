# Roadmap Intake Workflow

WeatherVane’s roadmap should evolve whenever critics, Atlas, or Director Dana discover
capability gaps—but additions must stay disciplined. Use this workflow to capture,
review, and promote new ideas without creating runaway scope.

## 1. Capture proposals in the intake inbox

- Run `python tools/wvo_mcp/scripts/roadmap_inbox.py add --title "..." --summary "..."`  
  to append a proposal to `state/roadmap_inbox.json`.
- Provide optional tags:
  - `--domain` (`product`, `mcp`, `go-to-market`, `ops`, etc.)
  - `--source` (`critic`, `atlas`, `director_dana`, etc.)
  - `--notes`, `--blockers`, `--signals` for context.
  - `--layers` to describe the impacted horizons (e.g., `surface,adjacent,product`).
  - `--integration` to summarise how the idea should mesh with adjacent layers or existing roadmap elements.
  - `--weights` to supply optional priors (JSON, e.g., `{"product": 8, "mcp": 0}`); the autonomous policy will treat them as hints and learn actual weights from execution data.
- Critics that identify gaps (e.g., design_system, allocator, inspiration) should log
  proposals after the run, tagging themselves as the source.

### Multi-layer evaluation checklist

Before adding an entry, evaluate the idea across at least three layers:

1. **Surface layer** – immediate feature/component that changes (UI, API endpoint, critic evidence, etc.).
2. **Adjacent layer** – neighbouring capabilities that must adapt (designer handoff, allocator integration, onboarding flows, data contracts, etc.).
3. **Whole product layer** – impact on the overall WeatherVane narrative (demo story, pricing, ops readiness, customer journey).

Record the chosen layers via `--layers` and summarise cross-layer adjustments with `--integration`. Critic outputs should reference these notes so Dana can judge scale and sequencing quickly.

## 2. Director Dana reviews the inbox

- Use `python tools/wvo_mcp/scripts/roadmap_inbox.py list --status pending_review`
  during roadmap reviews.
- Mark entries on the call:
  - Update the JSON entry to `status: accepted` or `status: rejected`
    (or capture the decision in meeting notes).

## 3. Promote accepted items into the roadmap

- Only Director Dana (or someone delegated) edits `state/roadmap.yaml`.
- When an item is accepted:
  1. Create/extend the appropriate epic/milestone.
  2. Remove the intake entry or mark it `accepted` with a reference to the new task ID.
  3. Announce the change in `state/context.md`.
- Entries marked `rejected` should note the rationale in the `notes` field for future reference.

## Guardrails

- **Do not** add tasks directly to `state/roadmap.yaml` without an accepted intake entry.
- Limit experiments: proposals should articulate user/customer value, not just an idea.
- When critics repeatedly log the same gap, convert it to a single roadmap item rather
  than duplicating entries.
- Keep `state/roadmap_inbox.json` under 200 entries—the intake script trims automatically.

This process keeps roadmap evolution transparent, empowers the automation to surface
high-impact ideas, and ensures Director Dana remains the final gate for scope changes.
