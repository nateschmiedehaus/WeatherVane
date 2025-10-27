
# Agent Handbook (Codex / MCP)

> **Scope:** Codex-specific agent guide. Mirrors `claude.md` but uses OpenAI/Codex stability controls. **WeatherVane** is a separate product via MCP (see `docs/weathervane/Product-Handbook.md`).

## 1) Rapid Orientation
- Start: `plan_next --minimal`, `autopilot_status` → restart script if needed.
- **NO FOLLOW-UPS**: `Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor`. No partials.
- Consensus & critics: follow Atlas/Dana; run integrity batch before “done”.
- Token hygiene: trim `state/context.md`, backups auto-written.

## 2) Codex Call Stability (required)
- Pin **model** to named stable build (e.g., `gpt-4.x-YYYYMMDD`/`o4-mini-YYYYMMDD` when available).
- Use `temperature: 0`, constrained top-p; **log** request/response JSON, usage, finish reason, version fingerprints.
- MCP servers allowlisted; log negotiated set.

## 3) Integration‑First (Search → Integrate → Verify)
Same as `claude.md`; see `docs/autopilot/Integration-Verification.md`.

## 4) Multi‑Agent Controls
Supervisor, blackboard events, leases, idempotency, conflict scoring, loop guard.

## 5) Observability
Use OTel GenAI spans; same SLOs as Claude.

## 6) Review & Zero‑Gaps / 7) Escalation Rules
Identical to `claude.md`.
