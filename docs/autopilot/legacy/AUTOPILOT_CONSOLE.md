# Autopilot Console Layout

WeatherVane’s autopilot now launches inside a tmux session (when `tmux` is available)
so you can watch the orchestration, agent activity, and raw logs at the same time.
The console also ships with an in-pane command palette for quick account logins and
approval toggles.

```
┌──────────────────────────────┬────────────────────────────┐
│ 🧠 Autopilot Console         │ 📊 Agent Dashboard          │
│                              │                            │
├──────────────────────────────┤────────────────────────────┤
│ 📜 Live Log                  │ 📡 Activity Feed            │
└──────────────────────────────┴────────────────────────────┘
```

## Key Bindings

- `Ctrl+b` `p` – open the **Agent Command Palette**
  - Login to Codex/Claude accounts, rotate approval policies (`never`, `on-request`, `always`)
  - Future providers (e.g. GLM) will appear here automatically once configured
- Within the palette press `d` for diagnostics pop-ups:
  - Live agent dashboard (`--mode agents --follow`)
  - Live activity feed (`--mode feed --tail 60`)
  - Current summary snapshot with blockers/notes
  - Blocker history (last five summaries)
  - Tail of `/tmp/wvo_autopilot.log`
  - Single-shot status ticker (`autopilot_status_line.py`)
- `Ctrl+b` `arrow keys` – move between panes
- `Ctrl+b` `[` – scroll inside a pane (press `q` to exit)
- `Ctrl+b` `d` – detach, leaving the autopilot running
  - Reattach with `tmux attach -t wvo_autopilot_*`
- `Ctrl+c` inside the autopilot pane – stop the run and clean up workers

## Status Bar

The tmux status line surfaces provider state in real time:

- **Left** – WeatherVane autopilot label
- **Right** – provider badges:
  - `🛠 codex: …` shows the active Codex account + approval level
  - `🧠 claude: …` reflects Claude login status
  - `🧬 glm: …` placeholder for upcoming Z.ai integration
  - UTC timestamp for quick sanity checks

> Autopilot bootstraps “top permissions” automatically: every configured Codex account
> is logged in and pushed to `approval=always`, and Claude credentials are refreshed
> before the first task dispatch. The command palette remains available if you need
> to dial permissions down mid-run.
> First-run tip: the Claude CLI requires `claude login --dangerously-skip-permissions`
> so you can accept the terms and grant folder access (macOS will prompt once). The
> tmux bootstrap issues the same command by default, so approve those requests the
> first time you see them.

The tmux status line now pulls live signal from `autopilot_status_line.py`:

- Green “● LIVE” indicator when the log is active.
- Latest phase message taken from the log tail.
- Counts for active (`⚙`), assigned (`⏳`), attention (`!`), idle (`☁`), plus total tokens.
- Provider mix snapshot (e.g. `🛠1 🧠1`) so you can confirm which agents are connected.

## Agent Dashboard

The right-hand pane renders a live summary built from
`state/autopilot_events.jsonl` via `activity_feed.py --mode agents`. Each agent
line shows:

- Emoji avatar (`🛠` Codex worker, `🧠` Claude coordinator, `🧬` GLM placeholder)
- Aggregate summary banner: state counts and provider mix for a quick read
- Per-agent cards with bold status, current task + elapsed time, and last action
- Total tokens consumed this session, plus reservation hints (files) beneath each card

## Environment Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `WVO_AUTOPILOT_TMUX` | Toggle tmux layout (set `0` to disable) | `1` |
| `WVO_AUTOPILOT_TMUX_FEED` | Show the structured activity feed pane | `1` |
| `WVO_AUTOPILOT_FEED_TAIL` | Number of feed lines to show initially | `25` |
| `WVO_AUTOPILOT_AGENT_REFRESH` | Agent dashboard refresh interval (seconds) | `2` |

When tmux is not available (or the session is non-interactive) the Makefile
falls back to the previous single-terminal behaviour.
