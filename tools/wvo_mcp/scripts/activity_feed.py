#!/usr/bin/env python3
"""Utility helpers for inspecting Autopilot activity feed, reservations, and token usage."""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


def safe_print(*args, **kwargs) -> None:
  try:
    print(*args, **kwargs)
  except BrokenPipeError:
    raise SystemExit(0)


def parse_iso_datetime(value: str) -> float:
  try:
    if value.endswith("Z"):
      value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).timestamp()
  except Exception:
    return 0.0

ROOT = Path(__file__).resolve().parents[3]
STATE_DIR = ROOT / "state"
EVENTS_PATH = STATE_DIR / "autopilot_events.jsonl"
RESERVATIONS_PATH = STATE_DIR / "reservations.json"
DEFAULT_STALE_MINUTES = 180


def _format_int(value: object) -> str:
  try:
    if isinstance(value, (int, float)):
      return str(int(value))
    if isinstance(value, str):
      return str(int(float(value)))
  except (ValueError, TypeError):
    pass
  if value is None:
    return "0"
  return str(value)


def trim_text(value: Optional[str], limit: int = 80) -> str:
  if not value:
    return ""
  text = str(value).strip()
  if len(text) <= limit:
    return text
  return text[: max(1, limit - 1)] + "…"


@dataclass
class ActivityEvent:
  type: str
  timestamp: int
  task_id: Optional[str]
  agent_id: Optional[str]
  data: dict = field(default_factory=dict)

  @classmethod
  def from_json(cls, raw: str) -> "ActivityEvent":
    payload = json.loads(raw)
    agent_id = payload.get("agentId")
    if agent_id is None:
      agent_id = payload.get("agent")
    return cls(
      type=payload.get("type", "unknown"),
      timestamp=int(payload.get("timestamp") or 0),
      task_id=payload.get("taskId"),
      agent_id=agent_id,
      data=payload.get("data") or {},
    )

  def format(self) -> str:
    timestamp = datetime.fromtimestamp(self.timestamp / 1000).strftime("%H:%M:%S")
    prefix = f"[{timestamp}] {self.type}"
    if self.task_id:
      prefix += f" task={self.task_id}"
    if self.agent_id:
      prefix += f" agent={self.agent_id}"

    formatter = EVENT_FORMATTERS.get(self.type)
    if formatter:
      suffix = formatter(self)
      if suffix:
        return f"{prefix} :: {suffix}"
      return prefix
    if self.data:
      return f"{prefix} :: {json.dumps(self.data, ensure_ascii=False)}"
    return prefix


@dataclass
class AgentState:
  agent_id: str
  agent_type: str = "codex"
  status: str = "idle"
  current_task: Optional[str] = None
  current_label: Optional[str] = None
  started_at: Optional[int] = None
  last_event_ts: int = 0
  last_result: Optional[str] = None
  tokens_total: int = 0
  tokens_prompt: int = 0
  tokens_completion: int = 0
  reservations: List[str] = field(default_factory=list)


AGENT_ICONS = {
  "codex": "🛠",
  "codex_planner": "🗺",
  "claude_code": "🧠",
  "claude": "🧠",
  "glm_code": "🧬",
  "orchestrator": "🪄",
  "critic": "🔍",
  "director": "🎯",
  "default": "🤖",
}


class FeedState:
  """Tracks live agent, reservation, and token status for concise summaries."""

  def __init__(self) -> None:
    self.active_tasks: Dict[str, Tuple[str, int]] = {}
    self.reservations: Dict[str, Tuple[str, str]] = {}
    self.conflict_count = 0
    self.tokens_overall = 0
    self.tokens_per_agent: Dict[str, Dict[str, float]] = {}
    self.last_summary: Optional[str] = None
    self.agent_states: Dict[str, AgentState] = {}
    self.capacity_summary: Optional[dict] = None
    self._last_summary_time: float = 0.0

  def _ensure_agent(self, agent_id: str, agent_type: Optional[str], timestamp: int) -> AgentState:
    state = self.agent_states.get(agent_id)
    if state is None:
      state = AgentState(agent_id=agent_id, agent_type=agent_type or "codex")
      self.agent_states[agent_id] = state
    elif agent_type:
      state.agent_type = agent_type
    state.last_event_ts = timestamp
    return state

  def apply(self, event: ActivityEvent) -> Optional[str]:
    if event.type == "execution_started":
      if event.task_id and event.agent_id:
        self.active_tasks[event.task_id] = (event.agent_id, event.timestamp)
        agent = self._ensure_agent(event.agent_id, event.data.get("agentType"), event.timestamp)
        agent.status = "working"
        agent.current_task = event.task_id
        agent.current_label = (event.data.get("reasoning") or "")[:160] or None
        agent.started_at = event.timestamp
        agent.last_result = None
    elif event.type == "execution_completed":
      if event.task_id:
        self.active_tasks.pop(event.task_id, None)
      if event.agent_id:
        agent = self._ensure_agent(event.agent_id, event.data.get("agentType"), event.timestamp)
        agent.current_task = None
        agent.current_label = None
        agent.started_at = None
        agent.tokens_prompt = int(event.data.get("promptTokens") or agent.tokens_prompt)
        agent.tokens_completion = int(event.data.get("completionTokens") or agent.tokens_completion)
        agent.tokens_total = int(event.data.get("totalTokens") or agent.tokens_total)
        success = bool(event.data.get("success"))
        duration = event.data.get("durationSeconds")
        final_status = event.data.get("finalStatus") or ""
        if success:
          agent.status = "idle"
          agent.last_result = (
            f"✅ {final_status} ({duration}s)" if duration else f"✅ {final_status}" or "✅"
          )
        else:
          agent.status = "attention"
          issues = event.data.get("issues") or []
          issue_text = ", ".join(map(str, issues[:2])) if issues else "execution failed"
          agent.last_result = f"⚠️ {issue_text}" + (f" ({duration}s)" if duration else "")
    elif event.type == "reservation_update":
      data = event.data or {}
      status = data.get("status")
      files = data.get("files") if isinstance(data, dict) else None
      if isinstance(files, list):
        for file in files:
          if not isinstance(file, str):
            continue
          if status == "reserved" and event.task_id and event.agent_id:
            self.reservations[file] = (event.task_id, event.agent_id)
            agent = self._ensure_agent(event.agent_id, None, event.timestamp)
            agent.reservations = sorted({*agent.reservations, file})[:6]
          elif status == "released":
            self.reservations.pop(file, None)
            if event.agent_id:
              agent = self._ensure_agent(event.agent_id, None, event.timestamp)
              agent.reservations = [f for f in agent.reservations if f != file]
    elif event.type == "reservation_conflict":
      self.conflict_count += 1
      existing_agent = event.data.get("existingAgentId") if event.data else None
      if isinstance(existing_agent, str):
        conflict_agent = self._ensure_agent(existing_agent, None, event.timestamp)
        conflict_agent.status = "attention"
        conflict_agent.last_result = f"⚠️ conflict on {event.data.get('file')}"
    elif event.type == "token_usage":
      data = event.data or {}
      overall = data.get("overallTokens")
      if isinstance(overall, (int, float)):
        self.tokens_overall = int(overall)
      agent_totals = data.get("agentTotals")
      if isinstance(agent_totals, dict):
        agent_key = event.agent_id or "unknown"
        self.tokens_per_agent[agent_key] = dict(agent_totals)
        agent = self._ensure_agent(agent_key, None, event.timestamp)
        agent.tokens_total = int(agent_totals.get("totalTokens") or agent.tokens_total)
        agent.tokens_prompt = int(agent_totals.get("promptTokens") or agent.tokens_prompt)
        agent.tokens_completion = int(agent_totals.get("completionTokens") or agent.tokens_completion)
    elif event.type == "task_assigned":
      if event.task_id and event.agent_id:
        agent = self._ensure_agent(event.agent_id, event.data.get("agentType"), event.timestamp)
        agent.status = "assigned"
        agent.current_task = event.task_id
        context_summary = event.data.get("contextSummary") or {}
        reasoning = event.data.get("reasoning") or ""
        if isinstance(context_summary, dict):
          hints = context_summary.get("researchHighlights") or context_summary.get("relatedTasks")
          if isinstance(hints, list) and hints:
            agent.current_label = str(hints[0])[:160]
          else:
            agent.current_label = reasoning[:160] or None
        else:
          agent.current_label = reasoning[:160] or None
        agent.started_at = None
        agent.last_result = None
    elif event.type == "agent_capacity":
      payload = event.data or {}
      summary = payload.get("summary") if isinstance(payload, dict) else None
      if isinstance(summary, dict):
        self.capacity_summary = summary

      agents_payload = payload.get("agents") if isinstance(payload, dict) else None
      if isinstance(agents_payload, list):
        seen_agents: set[str] = set()
        for agent_entry in agents_payload:
          if not isinstance(agent_entry, dict):
            continue
          agent_id = agent_entry.get("id")
          if not isinstance(agent_id, str) or not agent_id:
            continue
          seen_agents.add(agent_id)
          agent_type = agent_entry.get("type")
          state = self._ensure_agent(agent_id, agent_type, event.timestamp)
          status = agent_entry.get("status")
          if isinstance(status, str) and status:
            state.status = status
          current_task = agent_entry.get("currentTask") or agent_entry.get("assignedTaskId")
          state.current_task = current_task or None
          assigned_at = agent_entry.get("assignedAt")
          if isinstance(assigned_at, (int, float)):
            state.started_at = int(assigned_at)
          elif isinstance(assigned_at, str):
            try:
              state.started_at = int(parse_iso_datetime(assigned_at) * 1000)
            except Exception:
              state.started_at = None
          role = agent_entry.get("role")
          if isinstance(role, str) and role:
            if not state.current_task:
              state.current_label = role
        # Leave previously-known agents in place so we keep history

    return self._build_summary()

  def _build_summary(self, force: bool = False) -> Optional[str]:
    now_dt = datetime.now(timezone.utc)
    active_parts = []
    for task_id, (agent_id, _) in sorted(self.active_tasks.items()):
      active_parts.append(f"{agent_id}→{task_id}")
    active_str = ", ".join(active_parts) if active_parts else "none"

    reservation_count = len(self.reservations)
    conflicts = self.conflict_count
    capacity_fragments = []
    if isinstance(self.capacity_summary, dict):
      total_info = self.capacity_summary.get("total") or {}
      total_agents = _format_int(total_info.get("total"))
      available = _format_int(total_info.get("available"))
      busy = _format_int(total_info.get("busy"))
      cooldown = total_info.get("cooldown")
      capacity_bits = [f"total={total_agents}", f"idle={available}", f"busy={busy}"]
      if cooldown not in (None, 0, "0"):
        capacity_bits.append(f"cooldown={_format_int(cooldown)}")
      by_type = (
        self.capacity_summary.get("byType")
        or self.capacity_summary.get("by_type")
        or {}
      )
      type_bits = []
      if isinstance(by_type, dict):
        for agent_type, stats in sorted(by_type.items()):
          if isinstance(stats, dict):
            snapshot = (
              f"{agent_type} busy={_format_int(stats.get('busy'))} idle={_format_int(stats.get('available'))}"
            )
            cooldown_val = stats.get("cooldown")
            if cooldown_val not in (None, 0, "0"):
              snapshot += f" cooldown={_format_int(cooldown_val)}"
            type_bits.append(snapshot)
      capacity_text = "agents " + ", ".join(capacity_bits)
      if type_bits:
        capacity_text += f" | mix {'; '.join(type_bits)}"
      capacity_fragments.append(capacity_text)

    token_parts = []
    if self.tokens_overall:
      token_parts.append(f"total {self.tokens_overall}")
    for agent, totals in sorted(self.tokens_per_agent.items()):
      total_tokens = totals.get("totalTokens")
      if isinstance(total_tokens, (int, float)):
        token_parts.append(f"{agent}:{int(total_tokens)}")
    tokens_str = ", ".join(token_parts) if token_parts else "n/a"

    summary_bits = []
    summary_bits.extend(capacity_fragments)
    if self.agent_states:
      working = sum(1 for snapshot in self.agent_states.values() if snapshot.status == "working")
      assigned = sum(1 for snapshot in self.agent_states.values() if snapshot.status == "assigned")
      idle = sum(1 for snapshot in self.agent_states.values() if snapshot.status == "idle")
      attention = sum(1 for snapshot in self.agent_states.values() if snapshot.status == "attention")
      summary_bits.append(
        f"status working={working} assigned={assigned} idle={idle} attention={attention}"
      )

    agent_descriptions: List[str] = []
    for agent_id, snapshot in sorted(self.agent_states.items()):
      descriptor = ""
      if snapshot.current_task:
        descriptor = snapshot.current_task
      elif snapshot.current_label:
        descriptor = snapshot.current_label
      elif snapshot.last_result:
        descriptor = snapshot.last_result
      descriptor = trim_text(descriptor, 80)
      elapsed_text = ""
      if snapshot.started_at:
        elapsed = _format_elapsed(snapshot.started_at, now_dt)
        if elapsed and elapsed != "-":
          elapsed_text = f" elapsed={elapsed}"
      if descriptor:
        agent_descriptions.append(f"{agent_id}:{snapshot.status}({descriptor}{elapsed_text})")
      else:
        agent_descriptions.append(f"{agent_id}:{snapshot.status}{elapsed_text}")

    if agent_descriptions:
      summary_bits.append("agents " + ", ".join(agent_descriptions))

    reservations_text = f"reservations: {reservation_count}"
    if conflicts:
      reservations_text += f" (conflicts: {conflicts})"
    summary_bits.append(f"active: {active_str}")
    summary_bits.append(reservations_text)
    summary_bits.append(f"tokens: {tokens_str}")
    summary = " | ".join(summary_bits)

    if summary == self.last_summary and not force:
      return None
    self.last_summary = summary
    self._last_summary_time = time.time()
    return summary

  def heartbeat(self, interval: float = 5.0) -> Optional[str]:
    now = time.time()
    if not self.agent_states and not self.capacity_summary and not self.active_tasks and not self.reservations:
      return None
    if now - self._last_summary_time >= interval:
      return self._build_summary(force=True)
    return None


def _colour(text: str, colour: str) -> str:
  palette = {
    "green": "32",
    "cyan": "36",
    "yellow": "33",
    "red": "31",
    "magenta": "35",
    "grey": "90",
  }
  code = palette.get(colour)
  if not code:
    return text
  return f"\033[{code}m{text}\033[0m"


def _format_elapsed(start_at: Optional[int], now: datetime) -> str:
  if start_at is None:
    return "-"
  # feed timestamps are milliseconds since epoch
  delta_seconds = max(0, int(now.timestamp() - (start_at / 1000)))
  minutes, seconds = divmod(delta_seconds, 60)
  if minutes >= 60:
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h{minutes:02d}m"
  if minutes:
    return f"{minutes}m{seconds:02d}s"
  return f"{seconds}s"


def _format_since(ts: int, now: datetime) -> str:
  delta_seconds = max(0, int(now.timestamp() - (ts / 1000)))
  if delta_seconds < 60:
    return f"{delta_seconds}s ago"
  minutes, seconds = divmod(delta_seconds, 60)
  if minutes < 60:
    return f"{minutes}m{seconds:02d}s ago"
  hours, minutes = divmod(minutes, 60)
  return f"{hours}h{minutes:02d}m ago"


def _truncate(text: Optional[str], width: int) -> str:
  if not text:
    return ""
  if len(text) <= width:
    return text
  return text[: max(0, width - 1)].rstrip() + "…"


def _agent_icon(agent_type: str) -> str:
  return AGENT_ICONS.get(agent_type, AGENT_ICONS["default"])


def print_agent_dashboard(state: FeedState) -> None:
  now = datetime.now(timezone.utc)
  timestamp = now.strftime("%Y-%m-%d %H:%M:%S")
  width = 100
  title = f" Agent Overview • {timestamp}Z "
  width = max(width, len(title) + 4)
  top = "╔" + "═" * (width - 2) + "╗"
  title_line = "║" + title.center(width - 2) + "║"
  divider = "╠" + "═" * (width - 2) + "╣"
  bottom = "╚" + "═" * (width - 2) + "╝"

  print(top)
  print(title_line)
  print(divider)

  if not state.agent_states:
    empty_msg = "║" + " Waiting for agent activity… ".center(width - 2) + "║"
    print(empty_msg)
    print(bottom)
    return

  agents = sorted(state.agent_states.values(), key=lambda snapshot: snapshot.agent_id)
  status_buckets = {
    "working": 0,
    "assigned": 0,
    "idle": 0,
    "attention": 0,
  }
  type_counts: Dict[str, int] = {}
  for snapshot in agents:
    status_buckets[snapshot.status] = status_buckets.get(snapshot.status, 0) + 1
    type_counts[snapshot.agent_type] = type_counts.get(snapshot.agent_type, 0) + 1

  summary_segments = [
    f"Agents: {len(agents)}",
    _colour(f"WORKING {status_buckets.get('working', 0)}", "green"),
    _colour(f"ASSIGNED {status_buckets.get('assigned', 0)}", "cyan"),
    _colour(f"IDLE {status_buckets.get('idle', 0)}", "grey"),
    _colour(f"ATTENTION {status_buckets.get('attention', 0)}", "red"),
  ]
  summary_line = " • ".join(summary_segments)
  print("║ " + summary_line.ljust(width - 4) + " ║")

  type_parts = []
  for agent_type, count in sorted(type_counts.items()):
    icon = _agent_icon(agent_type)
    type_parts.append(f"{icon} {agent_type}:{count}")
  if type_parts:
    type_line = " | ".join(type_parts)
    print("║ " + type_line.ljust(width - 4) + " ║")
  print(divider.replace("╠", "╟", 1).replace("╣", "╢", 1))

  inner_width = width - 4
  label_width = 8
  value_width = max(20, inner_width - 4 - label_width)
  max_tokens = max((agent.tokens_total for agent in agents), default=0)
  bar_length = max(12, min(28, value_width - 12))

  def card_rule(char: str) -> str:
    return char + ("═" * (inner_width - 2)) + char

  def header_line(text: str) -> str:
    return f"║ {text:<{inner_width - 2}} ║"

  def card_line(label: str, value: str) -> str:
    clipped = _truncate(value, value_width)
    return f"║ {label:<{label_width}}{clipped:<{value_width}} ║"

  for index, snapshot in enumerate(agents):
    icon = _agent_icon(snapshot.agent_type)
    header = f"{icon} {snapshot.agent_id}  •  {snapshot.agent_type.replace('_', ' ')}"

    status_colour = {
      "working": "green",
      "assigned": "cyan",
      "idle": "grey",
      "attention": "red",
    }.get(snapshot.status, "magenta")
    status_text = _colour(snapshot.status.upper(), status_colour)

    task_label = snapshot.current_task or "--"
    elapsed = _format_elapsed(snapshot.started_at, now)

    detail = snapshot.current_label or snapshot.last_result or ""
    if snapshot.reservations and not detail:
      detail = ", ".join(snapshot.reservations[:3])
    elif snapshot.reservations:
      detail = f"{detail} | files: {', '.join(snapshot.reservations[:3])}"

    tokens = snapshot.tokens_total
    ratio = min(tokens / max_tokens, 1.0) if max_tokens else 0.0
    filled = int(round(bar_length * ratio))
    bar = "▉" * filled + "·" * (bar_length - filled)
    token_display = f"Σ {tokens:<5} {bar}"
    since = _format_since(snapshot.last_event_ts, now)

    print(f"║ {card_rule('╔')} ║")
    print(header_line(header[: inner_width - 2]))
    print(card_line("Status", status_text))
    print(card_line("Task", task_label))
    print(card_line("Elapsed", f"⏱ {elapsed}"))
    if detail:
      print(card_line("Notes", detail))
    print(card_line("Tokens", token_display))
    print(card_line("Last", since))
    print(f"║ {card_rule('╚')} ║")
    if index != len(agents) - 1:
      print("║ " + ("─" * (width - 4)) + " ║")

  totals_line = f" Σ tokens (overall): {state.tokens_overall}"
  print("║ " + totals_line.ljust(width - 4) + " ║")
  print(bottom)


def render_agents(path: Path, follow: bool, refresh: float) -> None:
  state = FeedState()
  processed = 0
  try:
    while True:
      events = read_events(path)
      if processed > len(events):
        state = FeedState()
        processed = 0
      for event in events[processed:]:
        state.apply(event)
      processed = len(events)

      sys.stdout.write("\033[2J\033[H")
      print_agent_dashboard(state)
      sys.stdout.flush()

      if not follow:
        break
      time.sleep(refresh)
  except KeyboardInterrupt:
    return


def format_task_assigned(event: ActivityEvent) -> str:
  agent_type = event.data.get("agentType")
  reason = event.data.get("reasoning")
  duration = event.data.get("estimatedDuration")
  pieces = []
  if agent_type:
    pieces.append(f"{agent_type}")
  if duration:
    pieces.append(f"ETA≈{duration}s")
  if reason:
    pieces.append(reason)
  return " | ".join(pieces)


def format_execution_started(event: ActivityEvent) -> str:
  files = event.data.get("files") or []
  brief = event.data.get("briefPath")
  parts = []
  if files:
    parts.append(f"{len(files)} files")
  if brief:
    parts.append(f"brief={brief}")
  reasoning = event.data.get("reasoning")
  if reasoning:
    parts.append(reasoning)
  return " | ".join(parts)


def format_execution_completed(event: ActivityEvent) -> str:
  status = "✅" if event.data.get("success") else "⚠️"
  duration = event.data.get("durationSeconds")
  tokens = event.data.get("totalTokens")
  parts = [status, f"final={event.data.get('finalStatus')}"]
  if duration is not None:
    parts.append(f"{duration}s")
  if tokens is not None:
    parts.append(f"{tokens} tok")
  issues = event.data.get("issues") or []
  if issues:
    parts.append("issues=" + ", ".join(map(str, issues[:3])))
  return " ".join(filter(None, parts))


def format_reservation_update(event: ActivityEvent) -> str:
  status = event.data.get("status")
  files = event.data.get("files") or []
  return f"{status} {len(files)} files"


def format_reservation_conflict(event: ActivityEvent) -> str:
  file = event.data.get("file")
  existing = event.data.get("existingTaskId")
  existing_agent = event.data.get("existingAgentId")
  return f"conflict on {file} (held by {existing}|{existing_agent})"


def format_token_usage(event: ActivityEvent) -> str:
  delta = event.data.get("delta") or {}
  agent_totals = event.data.get("agentTotals") or {}
  pieces = [
    f"+{delta.get('totalTokens', 0)} tok",
    f"agent total={agent_totals.get('totalTokens', 0)}",
    f"overall={event.data.get('overallTokens', 0)}",
  ]
  cost = delta.get("costUSD")
  if cost:
    pieces.append(f"cost=${cost:.3f}")
  return " | ".join(pieces)


def format_agent_task_completed(event: ActivityEvent) -> str:
  details = event.data or {}
  success = details.get("success")
  duration = details.get("durationSeconds")
  parts = [
    f"success={bool(success)}",
    f"duration={duration}s" if isinstance(duration, (int, float)) else None,
  ]
  compact = " | ".join(filter(None, parts))
  return compact or "task completed"


def format_web_inspiration(event: ActivityEvent) -> str:
  data = event.data or {}
  status = "captured" if data.get("success") else "failed"
  if data.get("enabled") is False:
    status = "disabled"
  cached = "cached" if data.get("cached") else "fresh"
  parts = [status, cached]
  category = data.get("category")
  if category:
    parts.append(f"category={trim_text(str(category), 40)}")
  duration = data.get("durationMs")
  if isinstance(duration, (int, float)):
    parts.append(f"{int(duration)}ms")
  url = data.get("url")
  url_text = trim_text(str(url), 80) if url else ""
  detail = " | ".join(parts)
  if url_text:
    return f"{url_text} :: {detail}"
  return detail


def format_agent_capacity(event: ActivityEvent) -> str:
  payload = event.data or {}
  summary = payload.get("summary") or {}
  total = summary.get("total") or {}
  by_type = summary.get("byType") or summary.get("by_type") or {}
  reason = payload.get("reason") or "update"
  total_text = (
    f"total={total.get('total', 0)} idle={total.get('available', 0)} busy={total.get('busy', 0)}"
  )
  type_bits = []
  for agent_type, stats in sorted(by_type.items()):
    type_bits.append(
      f"{agent_type}: idle={stats.get('available', 0)} busy={stats.get('busy', 0)} cooldown={stats.get('cooldown', 0)}"
    )
  snapshot = "; ".join(type_bits)
  if snapshot:
    return f"{reason} :: {total_text}; {snapshot}"
  return f"{reason} :: {total_text}"

EVENT_FORMATTERS = {
  "task_assigned": format_task_assigned,
  "execution_started": format_execution_started,
  "execution_completed": format_execution_completed,
  "reservation_update": format_reservation_update,
  "reservation_conflict": format_reservation_conflict,
  "token_usage": format_token_usage,
  "agent_task_completed": format_agent_task_completed,
  "agent_capacity": format_agent_capacity,
  "web_inspiration": format_web_inspiration,
}


def format_agent_log(event: ActivityEvent) -> Optional[str]:
  if event.type == "web_inspiration":
    data = event.data or {}
    ts = datetime.fromtimestamp(event.timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")
    url = trim_text(str(data.get("url") or "unknown"), 80)
    status = "captured" if data.get("success") else "failed"
    if data.get("enabled") is False:
      status = "disabled"
    cached = "cached" if data.get("cached") else "fresh"
    pieces = [status, cached]
    category = data.get("category")
    if category:
      pieces.append(f"category={trim_text(str(category), 32)}")
    duration = data.get("durationMs")
    if isinstance(duration, (int, float)):
      pieces.append(f"{int(duration)}ms")
    task_ref = data.get("taskId") or event.task_id
    if task_ref:
      pieces.append(f"task={task_ref}")
    detail = " | ".join(pieces)
    return f"[{ts}] [inspiration] {url} :: {detail}"

  if event.type == "agent_capacity":
    payload = event.data or {}
    summary = payload.get("summary") or {}
    total = summary.get("total") or {}
    by_type = summary.get("byType") or summary.get("by_type") or {}
    reason = payload.get("reason") or "update"
    ts = datetime.fromtimestamp(event.timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")
    bits = []
    for agent_type, stats in sorted(by_type.items()):
      bits.append(
        f"{agent_type}: idle={stats.get('available', 0)} busy={stats.get('busy', 0)} cooldown={stats.get('cooldown', 0)}"
      )
    total_text = (
      f"total={total.get('total', 0)} idle={total.get('available', 0)} busy={total.get('busy', 0)}"
    )
    detail = "; ".join(bits)
    suffix = f"{total_text}; {detail}" if detail else total_text
    return f"[{ts}] [capacity] {reason} :: {suffix}"

  agent_id = event.agent_id or event.data.get("agentId")
  if not agent_id:
    return None

  ts = datetime.fromtimestamp(event.timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")
  prefix = f"[{ts}] [agent {agent_id}]"
  task_id = event.task_id or event.data.get("taskId")

  if event.type == "task_assigned":
    agent_type = event.data.get("agentType")
    reason = event.data.get("reasoning")
    context = event.data.get("contextSummary") or {}
    context_brief = ""
    if isinstance(context, dict):
      context_brief = context.get("brief") or context.get("title") or ""
    details: List[str] = []
    if agent_type:
      details.append(agent_type)
    if reason:
      details.append(trim_text(reason, 100))
    if context_brief:
      details.append(trim_text(context_brief, 100))
    detail_text = f" :: {' | '.join(details)}" if details else ""
    return f"{prefix} assigned {task_id or 'unknown'}{detail_text}"

  if event.type == "execution_started":
    reason = event.data.get("reasoning")
    files = event.data.get("files") or []
    brief = event.data.get("briefPath")
    details = []
    if task_id:
      details.append(f"task={task_id}")
    if reason:
      details.append(trim_text(reason, 100))
    if files:
      details.append(f"{len(files)} file(s)")
    if brief:
      details.append(f"brief={brief}")
    detail_text = " | ".join(details)
    return f"{prefix} execution_started {detail_text}"

  if event.type == "execution_completed":
    success = bool(event.data.get("success"))
    final_status = event.data.get("finalStatus") or ""
    duration = event.data.get("durationSeconds")
    tokens = event.data.get("totalTokens")
    issues = event.data.get("issues") or []
    pieces = [
      f"task={task_id}" if task_id else "",
      "✅ success" if success else "⚠️ failed",
    ]
    if final_status:
      pieces.append(f"final={final_status}")
    if duration is not None:
      pieces.append(f"{duration}s")
    if tokens is not None:
      pieces.append(f"{tokens} tok")
    if issues:
      pieces.append("issues=" + ", ".join(map(lambda s: trim_text(str(s), 40), issues[:2])))
    detail_text = " | ".join(filter(None, pieces))
    return f"{prefix} execution_completed {detail_text}"

  if event.type == "reservation_update":
    status = event.data.get("status")
    files = event.data.get("files") or []
    file_sample = trim_text(files[0], 60) if files else ""
    parts = [status or "update"]
    if task_id:
      parts.append(f"task={task_id}")
    if files:
      parts.append(f"{len(files)} file(s)")
    if file_sample:
      parts.append(f"ex={file_sample}")
    return f"{prefix} reservation_update {' | '.join(parts)}"

  if event.type == "reservation_conflict":
    file_path = event.data.get("file")
    existing_agent = event.data.get("existingAgentId")
    existing_task = event.data.get("existingTaskId")
    details = []
    if file_path:
      details.append(trim_text(file_path, 80))
    if existing_agent:
      details.append(f"held_by={existing_agent}")
    if existing_task:
      details.append(f"task={existing_task}")
    return f"{prefix} reservation_conflict {' | '.join(details)}"

  if event.type == "agent_task_completed":
    success = bool(event.data.get("success"))
    duration = event.data.get("durationSeconds")
    parts = [
      f"task={task_id}" if task_id else "",
      "✅ success" if success else "⚠️ failed",
      f"{duration}s" if duration is not None else "",
    ]
    return f"{prefix} completed {' | '.join(filter(None, parts))}".strip()

  return None


def read_events(path: Path) -> List[ActivityEvent]:
  if not path.exists():
    return []
  events: List[ActivityEvent] = []
  with path.open("r", encoding="utf-8") as handle:
    for line in handle:
      line = line.strip()
      if not line:
        continue
      try:
        events.append(ActivityEvent.from_json(line))
      except json.JSONDecodeError:
        continue
  return events


def print_feed(events: Iterable[ActivityEvent]) -> None:
  state = FeedState()
  last_event: Optional[ActivityEvent] = None
  last_summary_output = False
  for event in events:
    summary = state.apply(event)
    safe_print(event.format())
    if summary:
      safe_print(f"   ↳ {summary}")
      last_summary_output = True
    else:
      last_summary_output = False
    last_event = event
  if last_event is None:
    return
  if not last_summary_output and state.last_summary:
    print(f"   ↳ {state.last_summary}")


def follow_feed(path: Path, interval: float, tail: int) -> None:
  printed = False
  while not path.exists():
    if not printed:
      safe_print("Waiting for activity feed...", file=sys.stderr)
      printed = True
    time.sleep(interval)

  state = FeedState()
  with path.open("r", encoding="utf-8") as handle:
    # Optionally show the last N lines on attach.
    lines = handle.readlines()
    if tail > 0 and lines:
      tail_slice = lines[-tail:]
      for line in tail_slice:
        line = line.strip()
        if not line:
          continue
        try:
          event = ActivityEvent.from_json(line)
        except json.JSONDecodeError:
          continue
        summary = state.apply(event)
        safe_print(event.format())
        if summary:
          safe_print(f"   ↳ {summary}")
    handle.seek(len("".join(lines)))
    try:
      while True:
        where = handle.tell()
        line = handle.readline()
        if not line:
          time.sleep(interval)
          heartbeat = state.heartbeat(max(interval, 2.0))
          if heartbeat:
            safe_print(heartbeat)
          handle.seek(where)
          continue
        line = line.strip()
        if not line:
          continue
        try:
          event = ActivityEvent.from_json(line)
        except json.JSONDecodeError:
          continue
        summary = state.apply(event)
        safe_print(event.format())
        if summary:
          safe_print(f"   ↳ {summary}")
    except KeyboardInterrupt:
      return


def follow_agent_log(path: Path, interval: float, tail: int, follow: bool) -> None:
  printed_wait = False
  while not path.exists():
    if not printed_wait:
      safe_print("Waiting for agent activity...", file=sys.stderr)
      printed_wait = True
    if not follow:
      return
    time.sleep(interval)

  processed = 0
  primed = False
  try:
    while True:
      events = read_events(path)
      if processed > len(events):
        processed = 0
      start_index = processed
      if not primed:
        if tail > 0 and len(events) > 0:
          start_index = max(0, len(events) - tail)
        primed = True
      for event in events[start_index:]:
        line = format_agent_log(event)
        if line:
          safe_print(line)
      processed = len(events)
      if not follow:
        break
      time.sleep(interval if interval > 0 else 2.0)
  except KeyboardInterrupt:
    return


def show_reservations(path: Path) -> None:
  if not path.exists():
    print("No active reservations.")
    return
  try:
    data = json.loads(path.read_text(encoding="utf-8"))
  except json.JSONDecodeError:
    print("Unable to parse reservations file.", file=sys.stderr)
    sys.exit(1)

  if not data:
    print("No active reservations.")
    return

  rows = []
  for file, record in sorted(data.items()):
    reserved_at = record.get("reservedAt") or 0
    timestamp = datetime.fromtimestamp(reserved_at / 1000).strftime("%H:%M:%S")
    rows.append(
      [
        file,
        record.get("taskId", "?"),
        record.get("agentId", "?"),
        timestamp,
      ]
    )

  widths = [
    max(len(row[idx]) for row in rows)
    for idx in range(len(rows[0]))
  ]
  header = ["file", "task", "agent", "since"]
  header_line = " | ".join(name.ljust(widths[idx]) for idx, name in enumerate(header))
  print(header_line)
  print("-" * len(header_line))
  for row in rows:
    print(" | ".join(row[idx].ljust(widths[idx]) for idx in range(len(row))))


def show_budget(events: Iterable[ActivityEvent]) -> None:
  latest_per_agent = {}
  latest_overall = 0
  for event in events:
    if event.type != "token_usage":
      continue
    latest_per_agent[event.agent_id or "unknown"] = event.data.get("agentTotals", {})
    latest_overall = event.data.get("overallTokens", latest_overall)

  if not latest_per_agent:
    print("No token usage recorded yet.")
    return

  print(f"Overall tokens: {latest_overall}")
  print("")
  header = ["agent", "prompt", "completion", "total", "cost"]
  print("{:<18} {:>10} {:>12} {:>10} {:>8}".format(*header))
  print("-" * 64)
  for agent, totals in sorted(latest_per_agent.items()):
    prompt = _format_int(totals.get("promptTokens"))
    completion = _format_int(totals.get("completionTokens"))
    total_tokens = _format_int(totals.get("totalTokens"))
    cost = totals.get("costUSD")
    cost_display = f"${cost:.3f}" if isinstance(cost, (int, float)) else "-"
    print(
      "{:<18} {:>10} {:>12} {:>10} {:>8}".format(
        agent,
        prompt,
        completion,
        total_tokens,
        cost_display,
      )
    )


def release_reservations(
  path: Path,
  *,
  files: Optional[List[str]] = None,
  stale_minutes: Optional[int] = None,
  release_all: bool = False,
) -> None:
  if not path.exists():
    print("No reservations recorded; nothing to release.")
    return

  try:
    data = json.loads(path.read_text(encoding="utf-8"))
  except json.JSONDecodeError:
    print("Unable to parse reservations file; aborting.", file=sys.stderr)
    sys.exit(1)

  if not isinstance(data, dict):
    print("Unexpected reservations format; aborting.", file=sys.stderr)
    sys.exit(1)

  files = files or []
  targets = set()
  for file in files:
    if not isinstance(file, str):
      continue
    normalized = file.replace("\\", "/")
    targets.add(normalized)
    # Also consider relative without leading ./ if provided
    if normalized.startswith("./"):
      targets.add(normalized[2:])

  removed = []
  now_ms = int(time.time() * 1000)
  stale_cutoff = None
  if stale_minutes is not None and stale_minutes >= 0:
    stale_cutoff = now_ms - (stale_minutes * 60 * 1000)

  new_data = {}
  for file, record in data.items():
    keep = True
    if release_all:
      keep = False
    if keep and targets:
      keep = file not in targets
    if keep and targets:
      # Also match normalized versions
      keep = file.replace("\\", "/") not in targets
    if keep and stale_cutoff is not None:
      reserved_at = record.get("reservedAt") if isinstance(record, dict) else None
      if isinstance(reserved_at, (int, float)):
        if reserved_at <= stale_cutoff:
          keep = False
    if keep:
      new_data[file] = record
    else:
      removed.append(file)

  if not removed:
    print("No reservations released.")
    return

  path.write_text(json.dumps(new_data, indent=2), encoding="utf-8")
  print(f"Released {len(removed)} reservation(s):")
  for file in removed:
    print(f"  - {file}")
def show_summary(events: Iterable[ActivityEvent], *, human: bool = True) -> dict:
  state = FeedState()
  for event in events:
    state.apply(event)

  # Merge reservations from on-disk state for completeness.
  if RESERVATIONS_PATH.exists():
    try:
      data = json.loads(RESERVATIONS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
      data = {}
    if isinstance(data, dict):
      for file, record in data.items():
        if not isinstance(record, dict):
          continue
        task_id = record.get("taskId")
        agent_id = record.get("agentId")
        if isinstance(file, str) and task_id and agent_id:
          state.reservations[file] = (task_id, agent_id)

  reservations_sorted = sorted(state.reservations.items())
  summary = {
    "active_tasks": [
      {
        "task_id": task_id,
        "agent_id": agent_id,
        "started_at": datetime.fromtimestamp(started_ts / 1000).isoformat()
        if started_ts
        else None,
      }
      for task_id, (agent_id, started_ts) in sorted(state.active_tasks.items())
    ],
    "reservations": [
      {"file": file, "task_id": task_id, "agent_id": agent_id}
      for file, (task_id, agent_id) in reservations_sorted
    ],
    "reservation_conflicts": state.conflict_count,
    "tokens": {
      "overall_tokens": state.tokens_overall,
      "per_agent": {
        agent: {
          "prompt_tokens": totals.get("promptTokens"),
          "completion_tokens": totals.get("completionTokens"),
          "total_tokens": totals.get("totalTokens"),
          "cost_usd": totals.get("costUSD"),
        }
        for agent, totals in state.tokens_per_agent.items()
      },
    },
    "generated_at": datetime.utcnow().isoformat() + "Z",
  }

  if human:
    print("=== Autopilot Session Summary ===")

    if summary["active_tasks"]:
      print("Active tasks:")
      for record in summary["active_tasks"][:10]:
        started = record.get("started_at")
        print(f"  - {record['task_id']} ← {record['agent_id']} (since {started or '?'})")
      if len(summary["active_tasks"]) > 10:
        print(f"  ... +{len(summary['active_tasks']) - 10} more")
    else:
      print("Active tasks: none")

    if summary["reservations"]:
      print(f"Reservations: {len(summary['reservations'])}")
      for record in summary["reservations"][:10]:
        print(f"  - {record['file']} ← {record['task_id']} ({record['agent_id']})")
      if len(summary["reservations"]) > 10:
        print(f"  ... +{len(summary['reservations']) - 10} more")
    else:
      print("Reservations: none")

    if summary["reservation_conflicts"]:
      print(f"Reservation conflicts recorded: {summary['reservation_conflicts']}")

    tokens = summary["tokens"]
    per_agent = tokens["per_agent"]
    if per_agent or tokens["overall_tokens"]:
      print(f"Token usage (total tokens ≈ {tokens['overall_tokens']})")
      for agent, totals in sorted(per_agent.items()):
        prompt = _format_int(totals["prompt_tokens"])
        completion = _format_int(totals["completion_tokens"])
        total_tokens = _format_int(totals["total_tokens"])
        cost = totals["cost_usd"]
        cost_display = f"${cost:.3f}" if isinstance(cost, (int, float)) else "-"
        print(
          f"  - {agent}: prompt={prompt}, completion={completion}, total={total_tokens}, cost={cost_display}"
        )
    else:
      print("Token usage: n/a")

  return summary


def parse_args(argv: List[str]) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument(
    "--mode",
    choices=("feed", "reservations", "budget", "summary", "release", "agents", "agent-log"),
    default="feed",
    help="View mode (default: feed)",
  )
  parser.add_argument(
    "--follow",
    action="store_true",
    help="Continuously refresh output (feed/agents modes)",
  )
  parser.add_argument(
    "--tail",
    type=int,
    default=25,
    help="Number of recent events to display before following",
  )
  parser.add_argument(
    "--interval",
    type=float,
    default=2.0,
    help="Polling interval while following (seconds)",
  )
  parser.add_argument(
    "--output",
    help="When used with summary mode, append JSON summary to this file",
  )
  parser.add_argument(
    "--json",
    action="store_true",
    help="Emit summary as JSON to stdout (summary mode only)",
  )
  parser.add_argument(
    "--no-human",
    action="store_true",
    help="Skip human-readable summary output (summary mode only)",
  )
  parser.add_argument(
    "--file",
    dest="release_files",
    action="append",
    help="Reservation file path to release (release mode; can be repeated)",
  )
  parser.add_argument(
    "--stale-minutes",
    type=int,
    default=None,
    help="Release reservations older than this many minutes (release mode)",
  )
  parser.add_argument(
    "--all",
    action="store_true",
    help="Release all reservations (release mode)",
  )
  return parser.parse_args(argv)


def main(argv: List[str]) -> int:
  args = parse_args(argv)
  if args.mode == "feed":
    if args.follow:
      follow_feed(EVENTS_PATH, args.interval, args.tail)
    else:
      events = read_events(EVENTS_PATH)
      if not events:
        print("No activity recorded yet.")
      else:
        print_feed(events[-args.tail:])
    return 0

  if args.mode == "reservations":
    show_reservations(RESERVATIONS_PATH)
    return 0

  if args.mode == "budget":
    events = read_events(EVENTS_PATH)
    show_budget(events)
    return 0

  if args.mode == "summary":
    events = read_events(EVENTS_PATH)
    human = not args.no_human
    summary = show_summary(events, human=human)
    if args.output:
      out_path = Path(args.output)
      out_path.parent.mkdir(parents=True, exist_ok=True)
      with out_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(summary, ensure_ascii=False) + "\n")
    if args.json:
      print(json.dumps(summary, ensure_ascii=False))
    return 0

  if args.mode == "agents":
    refresh = args.interval if args.interval > 0 else 2.0
    follow = args.follow
    if not follow and not sys.stdout.isatty():
      follow = True
    render_agents(EVENTS_PATH, follow, refresh)
    return 0

  if args.mode == "agent-log":
    refresh = args.interval if args.interval > 0 else 2.0
    follow_agent_log(EVENTS_PATH, refresh, args.tail, args.follow)
    return 0

  if args.mode == "release":
    release_reservations(
      RESERVATIONS_PATH,
      files=args.release_files,
      stale_minutes=args.stale_minutes if args.stale_minutes is not None else DEFAULT_STALE_MINUTES if not args.release_files and not args.all else None,
      release_all=args.all,
    )
    return 0

  return 1


if __name__ == "__main__":
  sys.exit(main(sys.argv[1:]))
