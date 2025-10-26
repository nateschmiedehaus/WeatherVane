import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "python_toolchain.sh"


def _selected_python() -> str:
    result = subprocess.run(
        [str(SCRIPT)],
        check=True,
        capture_output=True,
        text=True,
    )
    python_bin = result.stdout.strip()
    if not python_bin:
        raise AssertionError("python_toolchain.sh returned empty interpreter")
    return python_bin


def test_python_toolchain_can_import_numpy() -> None:
    python_bin = _selected_python()
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{ROOT}/.deps:{ROOT}"
    probe = subprocess.run(
        [python_bin, "-c", "import numpy, sys; print((numpy.__version__, sys.version_info[:2]))"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert probe.returncode == 0, probe.stderr
    assert "2." in probe.stdout or "1." in probe.stdout, probe.stdout
