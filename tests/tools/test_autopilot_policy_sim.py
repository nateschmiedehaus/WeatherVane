import json
import subprocess
from pathlib import Path


def test_autopilot_policy_simulation_runs(tmp_path: Path) -> None:
    csv_path = tmp_path / "sim_metrics.csv"
    state_path = tmp_path / "policy_state.json"
    history_path = tmp_path / "policy_history.jsonl"
    balance_path = tmp_path / "balance.json"
    roadmap_path = tmp_path / "roadmap.yaml"

    cmd = [
        "python",
        "tools/wvo_mcp/scripts/autopilot_policy_sim.py",
        "--episodes",
        "2",
        "--max-steps",
        "8",
        "--seed",
        "123",
        "--policy-state",
        str(state_path),
        "--policy-history",
        str(history_path),
        "--balance-file",
        str(balance_path),
        "--roadmap-file",
        str(roadmap_path),
        "--csv",
        str(csv_path),
        "--reset-policy",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=True)

    assert "Average reward/step" in result.stdout
    assert csv_path.exists()
    assert state_path.exists()

    content = csv_path.read_text(encoding="utf-8").strip()
    # Expect CSV header plus at least one data row.
    lines = [line for line in content.splitlines() if line]
    assert len(lines) >= 2
    header_columns = lines[0].split(",")
    assert {"episode", "step", "domain", "reward"}.issubset(header_columns)
