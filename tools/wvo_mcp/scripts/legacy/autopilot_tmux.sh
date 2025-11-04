#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_PATH="${LOG_FILE:-/tmp/wvo_autopilot.log}"
SESSION="wvo_autopilot_${RANDOM}"
STATUS_FILE="$(mktemp)"
FEED_TAIL="${WVO_AUTOPILOT_FEED_TAIL:-25}"
SHOW_FEED="${WVO_AUTOPILOT_TMUX_FEED:-1}"
AGENT_REFRESH="${WVO_AUTOPILOT_AGENT_REFRESH:-2}"
BASE_INSTRUCTIONS="${BASE_INSTRUCTIONS:-$ROOT/docs/wvo_prompt.md}"
WORKSPACE="${WVO_AUTOPILOT_WORKSPACE:-$ROOT}"
STATE_PATH="${WVO_AUTOPILOT_STATE_FILE:-/tmp/wvo_autopilot_last.json}"
EVENTS_PATH="$ROOT/state/autopilot_events.jsonl"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not available; cannot launch tmux-enabled autopilot." >&2
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  echo "Python is required for the agent dashboard. Install Python 3 before using the tmux console." >&2
  exit 1
fi

cleanup() {
  rm -f "$STATUS_FILE"
}
trap cleanup EXIT

AUTOPILOT_CMD=$(
  cat <<EOF
cd "$ROOT"
trap 'tmux wait-for -S autopilot_done >/dev/null 2>&1 || true' EXIT
LOG_FILE="$LOG_PATH" tools/wvo_mcp/scripts/autopilot.sh
EXIT_CODE=\$?
echo "\$EXIT_CODE" > "$STATUS_FILE"
exit "\$EXIT_CODE"
EOF
)

TAIL_CMD=$(
  cat <<EOF
tail -Fn +1 "$LOG_PATH"
EOF
)

AGENT_CMD=$(
  cat <<EOF
cd "$ROOT"
PYTHONUNBUFFERED=1 python tools/wvo_mcp/scripts/activity_feed.py --mode agents --interval "$AGENT_REFRESH" --follow
EOF
)

FEED_CMD=$(
  cat <<EOF
cd "$ROOT"
PYTHONUNBUFFERED=1 python tools/wvo_mcp/scripts/activity_feed.py --mode feed --follow --tail "$FEED_TAIL"
EOF
)

tmux new-session -d -s "$SESSION" "$(printf "ROOT=%q LOG_PATH=%q STATUS_FILE=%q bash -lc %q" "$ROOT" "$LOG_PATH" "$STATUS_FILE" "$AUTOPILOT_CMD")"
RIGHT_PANE=$(tmux split-window -h -p 35 -t "$SESSION:0.0" -PF "#{pane_id}" "$(printf "ROOT=%q bash -lc %q" "$ROOT" "$AGENT_CMD")")
LOG_PANE=$(tmux split-window -v -p 25 -t "$SESSION:0.0" -PF "#{pane_id}" "$(printf "bash -lc %q" "$TAIL_CMD")")
if [ "$SHOW_FEED" = "1" ]; then
  FEED_PANE=$(tmux split-window -v -p 45 -t "$SESSION:${RIGHT_PANE}" -PF "#{pane_id}" "$(printf "ROOT=%q bash -lc %q" "$ROOT" "$FEED_CMD")")
fi

AUTOPILOT_PANE=$(tmux display-message -p -t "$SESSION:0.0" "#{pane_id}")

tmux select-pane -t "$SESSION:0.0"

tmux set-option -t "$SESSION" status on
tmux set-option -t "$SESSION" status-interval 3
tmux set-option -t "$SESSION" status-style "bg=colour236,fg=colour253"
tmux set-option -t "$SESSION" status-left '#[bg=colour24,fg=colour231,bold] ⛅ WeatherVane #[default] #[fg=colour250]Autopilot'
STATUS_CMD="#(python \"$ROOT/tools/wvo_mcp/scripts/autopilot_status_line.py\" --log \"$LOG_PATH\" --events \"$ROOT/state/autopilot_events.jsonl\")"
tmux set-option -t "$SESSION" status-right "$STATUS_CMD #[fg=colour240]| %Y-%m-%d %H:%MZ"

tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-style "fg=colour238"
tmux set-option -t "$SESSION" pane-active-border-style "fg=colour81"

tmux set-option -pt "$SESSION:${AUTOPILOT_PANE}" pane-border-format '#[fg=colour81,bold]🧠 Autopilot Console#[default]'
tmux set-option -pt "$SESSION:${LOG_PANE}" pane-border-format '#[fg=colour214]📜 Live Log#[default]'
tmux set-option -pt "$SESSION:${RIGHT_PANE}" pane-border-format '#[fg=colour45]📊 Agent Dashboard#[default]'
if [ "$SHOW_FEED" = "1" ] && [ -n "${FEED_PANE:-}" ]; then
  tmux set-option -pt "$SESSION:${FEED_PANE}" pane-border-format '#[fg=colour39]📡 Activity Feed#[default]'
fi

tmux set-option -t "$SESSION" window-style "bg=colour235"
tmux set-option -t "$SESSION" window-active-style "bg=colour235"

tmux set-environment -t "$SESSION" WVO_AUTOPILOT_SESSION "$SESSION"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_ROOT "$ROOT"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_LOG "$LOG_PATH"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_STATUS_FILE "$STATUS_FILE"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_AGENT_REFRESH "$AGENT_REFRESH"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_BASE_INSTRUCTIONS "$BASE_INSTRUCTIONS"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_WORKSPACE "$WORKSPACE"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_STATE_FILE "$STATE_PATH"
tmux set-environment -t "$SESSION" WVO_AUTOPILOT_EVENTS_PATH "$EVENTS_PATH"

MENU_CMD=$(
  printf "ROOT=%q python %q menu --session %q --root %q --workspace %q --instructions %q" \
    "$ROOT" \
    "$ROOT/tools/wvo_mcp/scripts/autopilot_console_menu.py" \
    "$SESSION" \
    "$ROOT" \
    "$WORKSPACE" \
    "$BASE_INSTRUCTIONS"
)
tmux bind-key -T prefix p run-shell "$MENU_CMD"
tmux set-option -t "$SESSION" display-panes-time 1500

BOOTSTRAP_CMD=$(
  printf "ROOT=%q python %q bootstrap --session %q --root %q --workspace %q --instructions %q" \
    "$ROOT" \
    "$ROOT/tools/wvo_mcp/scripts/autopilot_console_menu.py" \
    "$SESSION" \
    "$ROOT" \
    "$WORKSPACE" \
    "$BASE_INSTRUCTIONS"
)
tmux run-shell -t "$SESSION" "$BOOTSTRAP_CMD"

tmux display-message -t "$SESSION" "Prefix+p → Agent command palette · Prefix+1/2/3 → panes · Ctrl+b d to detach"

(
  tmux wait-for -L autopilot_done
  tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
) &
WAITER_PID=$!

tmux attach -t "$SESSION" || true
wait "$WAITER_PID" 2>/dev/null || true

EXIT_CODE=1
if [ -f "$STATUS_FILE" ]; then
  EXIT_CODE="$(cat "$STATUS_FILE")"
fi

exit "$EXIT_CODE"
