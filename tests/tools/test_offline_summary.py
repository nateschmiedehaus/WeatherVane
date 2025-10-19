from pathlib import Path

from tools.wvo_mcp.scripts import offline_summary


def test_offline_summary_structure(tmp_path: Path) -> None:
  output = tmp_path / "summary.json"
  summary = offline_summary.write_summary(output, "network-unreachable", "DNS lookup failed for api.openai.com")

  assert output.exists()
  written = output.read_text(encoding="utf-8")
  assert '"source": "offline_fallback"' in written

  assert summary["_meta"]["source"] == "offline_fallback"
  assert summary["_meta"]["reason"] == "network-unreachable"
  assert "DNS lookup failed" in summary["_meta"]["diagnostic"]
  assert "Autopilot unavailable: network-unreachable" in summary["blockers"][0]
  assert "Offline fallback invoked (network-unreachable)." in summary["notes"]
