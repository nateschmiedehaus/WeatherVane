#!/usr/bin/env python3
"""Render a rich tmux status segment for the Autopilot console."""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Deque, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_ROOT = ROOT / "tools" / "wvo_mcp" / "scripts"

if str(SCRIPTS_ROOT) not in os.sys.path:
  os.sys.path.insert(0, str(SCRIPTS_ROOT))

from activity_feed import ActivityEvent, FeedState  # type: ignore  # pylint: disable=wrong-import-position


def _read_tail(path: Path, limit: int = 200) -> List[str]:
  if not path.exists():
    return []
  lines: Deque[str] = deque(maxlen=limit)
  try:
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
      for line in handle:
        lines.append(line.rstrip("\n"))
  except OSError:
    return []
  return list(lines)


def _read_event_tail(path: Path, limit: int = 400) -> List[str]:
  return _read_tail(path, limit=limit)


def _parse_events(lines: Iterable[str]) -> FeedState:
  state = FeedState()
  for line in lines:
    line = line.strip()
    if not line:
      continue
    try:
      event = ActivityEvent.from_json(line)
    except json.JSONDecodeError:
      continue
    state.apply(event)
  return state


def _format_last_message(lines: List[str]) -> str:
  for line in reversed(lines):
    if not line.strip():
      continue
    parts = line.strip().split(" ", 1)
    message = parts[1] if len(parts) > 1 else line
    message = message.replace("\t", " ").strip()
    if len(message) > 60:
      message = message[:57].rstrip() + "…"
    return message
  return "Waiting for activity"


@dataclass
class StatusInfo:
  indicator: str
  message: str
  message_colour: str
  spinner: str
  active: int
  assigned: int
  attention: int
  idle: int
  tokens: int
  agent_segments: List[str]


SPINNER_FRAMES = tuple("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")


def _spinner(now: float) -> str:
  index = int(now) % len(SPINNER_FRAMES)
  return SPINNER_FRAMES[index]


def _classify_message(message: str) -> str:
  lowered = message.lower()
  if "offline fallback" in lowered or "offline" in lowered:
    return "colour196"
  if "blocked" in lowered or "timeout" in lowered or "failed" in lowered:
    return "colour214"
  if "warn" in lowered:
    return "colour220"
  return "colour252"


def build_status_info(log_path: Path, events_path: Path, now: Optional[float] = None) -> StatusInfo:
  if now is None:
    now = time.time()

  log_lines = _read_tail(log_path, 200)
  event_lines = _read_event_tail(events_path, 400)
  state = _parse_events(event_lines)

  active = len(state.active_tasks)
  assigned = sum(1 for agent in state.agent_states.values() if agent.status == "assigned")
  attention = sum(1 for agent in state.agent_states.values() if agent.status == "attention")
  idle = sum(1 for agent in state.agent_states.values() if agent.status == "idle")
  tokens = state.tokens_overall or sum(agent.tokens_total for agent in state.agent_states.values())

  last_message = _format_last_message(log_lines)
  message_colour = _classify_message(last_message)

  type_counts = {}
  for snapshot in state.agent_states.values():
    type_counts[snapshot.agent_type] = type_counts.get(snapshot.agent_type, 0) + 1

  agent_segments = []
  for agent_type, count in sorted(type_counts.items()):
    icon = {
      "codex": "🛠",
      "codex_planner": "🗺",
      "claude_code": "🧠",
      "claude": "🧠",
      "glm_code": "🧬",
      "default": "🤖",
    }.get(agent_type, "🤖")
    agent_segments.append(f"{icon}{count}")

  indicator = "#[fg=colour46]● LIVE" if log_path.exists() else "#[fg=colour244]○ OFF"
  spinner = _spinner(now)

  return StatusInfo(
    indicator=indicator,
    message=last_message,
    message_colour=message_colour,
    spinner=f"#[fg=colour117]{spinner}",
    active=active,
    assigned=assigned,
    attention=attention,
    idle=idle,
    tokens=tokens,
    agent_segments=agent_segments,
  )


def render_status(info: StatusInfo) -> str:
  parts = [
    info.indicator,
    info.spinner,
    f"#[fg={info.message_colour}]{info.message}",
    f"#[fg=colour39]⚙ {info.active}",
    f"#[fg=colour45]⏳ {info.assigned}",
    f"#[fg=colour214]Σ {info.tokens}",
  ]
  if info.attention:
    parts.append(f"#[fg=colour196]! {info.attention}")
  if info.idle:
    parts.append(f"#[fg=colour244]☁ {info.idle}")
  if info.agent_segments:
    parts.append("#[fg=colour111]" + " ".join(info.agent_segments))
  return " ".join(parts)


def build_status(log_path: Path, events_path: Path, now: Optional[float] = None) -> str:
  info = build_status_info(log_path, events_path, now=now)
  return render_status(info)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--log", required=True, help="Path to the autopilot log file.")
  parser.add_argument("--events", required=True, help="Path to the autopilot events jsonl.")
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  log_path = Path(args.log).expanduser()
  events_path = Path(args.events).expanduser()
  text = build_status(log_path, events_path)
  print(text)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
