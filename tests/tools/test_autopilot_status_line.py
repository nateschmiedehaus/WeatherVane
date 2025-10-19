from pathlib import Path

from tools.wvo_mcp.scripts import autopilot_status_line as status_line


def _write(path: Path, text: str) -> None:
  path.write_text(text, encoding="utf-8")


def test_build_status_formats_summary(tmp_path: Path) -> None:
  log_path = tmp_path / "autopilot.log"
  events_path = tmp_path / "autopilot_events.jsonl"

  _write(
    log_path,
    "\n".join(
      [
        "2025-10-19T14:05:00Z ✅ Autopilot iteration completed.",
        "2025-10-19T14:05:05Z announce_phase Execution Starting: task T-1",
      ]
    ),
  )
  _write(
    events_path,
    "\n".join(
      [
        '{"type":"execution_started","timestamp":1700000000000,"taskId":"T-1","agentId":"codex_worker_1","data":{"agentType":"codex"}}',
        '{"type":"execution_completed","timestamp":1700000005000,"taskId":"T-1","agentId":"codex_worker_1","data":{"agentType":"codex","success":true,"totalTokens":128,"promptTokens":64,"completionTokens":64}}',
        '{"type":"task_assigned","timestamp":1700000006000,"taskId":"T-2","agentId":"claude_code_1","data":{"agentType":"claude_code"}}',
      ]
    ),
  )

  output = status_line.build_status(log_path, events_path, now=0)

  assert "LIVE" in output
  assert "⠋" in output  # spinner frame for now=0
  assert "⚙ 0" in output
  assert "⏳ 1" in output
  assert "Σ 128" in output
  assert "🧠1" in output
