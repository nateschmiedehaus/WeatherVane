from datetime import datetime, timezone

from tools.wvo_mcp.scripts import activity_feed


class _FrozenDateTime(datetime):
  """Override datetime.now for deterministic dashboard output."""

  @classmethod
  def now(cls, tz=None):  # type: ignore[override]
    return datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def build_event(**kwargs):
  return activity_feed.ActivityEvent(
    type=kwargs.get("type", "execution_started"),
    timestamp=kwargs.get("timestamp", 1_700_000_000_000),
    task_id=kwargs.get("task_id"),
    agent_id=kwargs.get("agent_id"),
    data=kwargs.get("data", {}),
  )


def test_feed_state_tracks_agents(monkeypatch, capsys):
  monkeypatch.setattr(activity_feed, "datetime", _FrozenDateTime)

  state = activity_feed.FeedState()

  state.apply(
    build_event(
      type="execution_started",
      timestamp=1_700_000_000_000,
      task_id="TASK-42",
      agent_id="codex_worker_1",
      data={"agentType": "codex", "reasoning": "Implement feature X"},
    )
  )
  state.apply(
    build_event(
      type="reservation_update",
      timestamp=1_700_000_100_000,
      task_id="TASK-42",
      agent_id="codex_worker_1",
      data={"status": "reserved", "files": ["apps/api/routes/__init__.py"]},
    )
  )
  state.apply(
    build_event(
      type="execution_completed",
      timestamp=1_700_000_200_000,
      task_id="TASK-42",
      agent_id="codex_worker_1",
      data={
        "agentType": "codex",
        "success": True,
        "totalTokens": 256,
        "promptTokens": 104,
        "completionTokens": 152,
        "durationSeconds": 18,
        "finalStatus": "completed",
      },
    )
  )
  state.apply(
    build_event(
      type="task_assigned",
      timestamp=1_700_000_300_000,
      task_id="TASK-99",
      agent_id="claude_code_1",
      data={
        "agentType": "claude_code",
        "reasoning": "Peer review pending changes",
        "contextSummary": {"researchHighlights": ["Focus on API routes"]},
      },
    )
  )

  assert "codex_worker_1" in state.agent_states
  codex_state = state.agent_states["codex_worker_1"]
  assert codex_state.status == "idle"
  assert codex_state.tokens_total == 256
  assert codex_state.reservations == ["apps/api/routes/__init__.py"]

  claude_state = state.agent_states["claude_code_1"]
  assert claude_state.status == "assigned"
  assert claude_state.current_task == "TASK-99"

  activity_feed.print_agent_dashboard(state)
  output = capsys.readouterr().out

  assert "🛠 codex_worker_1" in output
  assert "🧠 claude_code_1" in output
  assert "Agents: 2" in output
  assert "ASSIGNED 1" in output
  assert "IDLE 1" in output
  assert "🛠 codex:1" in output
  assert "🧠 claude_code:1" in output
  assert "Tokens" in output
  assert "Σ tokens (overall)" in output
